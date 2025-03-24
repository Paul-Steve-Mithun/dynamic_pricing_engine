from fastapi import FastAPI, HTTPException, Query, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from datetime import datetime, timedelta
from typing import List, Optional
import os, httpx
import json
import joblib
import numpy as np
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient
from bson import ObjectId
from sklearn.ensemble import RandomForestRegressor
from googleapiclient.discovery import build
import pandas as pd
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

# Load environment variables
load_dotenv()

# Load the pre-trained Random Forest model
try:
    model_path = os.path.join(os.path.dirname(__file__), "random_forest_model_steve1.pkl")
    rf_model = joblib.load(model_path)
except Exception as e:
    rf_model = None

app = FastAPI(title="Hotel Dynamic Pricing API")

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# MongoDB Connection
MONGODB_URI = os.getenv("MONGODB_URI")
DB_NAME = os.getenv("DB_NAME")

# MongoDB client instance
client = AsyncIOMotorClient(MONGODB_URI)
db = client[DB_NAME]

# Models
class PyObjectId(ObjectId):
    @classmethod
    def __get_validators__(cls):
        yield cls.validate

    @classmethod
    def validate(cls, v):
        if not ObjectId.is_valid(v):
            raise ValueError("Invalid ObjectId")
        return ObjectId(v)

    @classmethod
    def __get_pydantic_json_schema__(cls, _schema_generator, _field_schema):
        return {"type": "string"}

class RoomModel(BaseModel):
    id: Optional[PyObjectId] = None
    room_id: int
    type: str
    base_price: float
    description: str
    amenities: List[str]
    capacity: int
    image_url: str
    
    class Config:
        arbitrary_types_allowed = True
        json_encoders = {
            ObjectId: str
        }

class RoomPricing(BaseModel):
    room_id: int
    price: float
    base_price: float
    price_factors: dict

class GuestDetails(BaseModel):
    email: str
    phone: str
    address: str
    city: str
    country: str
    zip_code: str
    special_requests: Optional[str] = None
    payment_method: str

class Booking(BaseModel):
    room_id: int
    guest_name: str
    check_in: str
    check_out: str
    guests: int
    price_per_night: float
    total_price: float
    guest_details: Optional[GuestDetails] = None

# Database dependency
async def get_db():
    return db

# Setup Google Calendar API
SCOPES = ['https://www.googleapis.com/auth/calendar.readonly']

def get_google_calendar_service():
    """Set up the Google Calendar API client using API key"""
    api_key = os.getenv('GOOGLE_CALENDAR_API_KEY')
    if not api_key:
        raise ValueError("Google Calendar API key not found in environment variables")
    
    service = build('calendar', 'v3', developerKey=api_key)
    return service

async def get_holidays(start_date, end_date):
    """Get holidays between the given dates using the Tamil holidays calendar"""
    try:
        service = get_google_calendar_service()
        events_result = service.events().list(
            # Changed to Tamil Nadu holidays calendar ID
            calendarId='en.indian#holiday@group.v.calendar.google.com',
            timeMin=start_date + 'T00:00:00Z',
            timeMax=end_date + 'T23:59:59Z',
            singleEvents=True,
            orderBy='startTime'
        ).execute()
        
        # Add detailed logging
        print("Google Calendar API Response:", events_result)
        
        events = events_result.get('items', [])
        if not events:
            print("No Tamil holidays found in the date range")
        else:
            print(f"Found {len(events)} Tamil holidays")
            
        holidays = {}
        for event in events:
            start = event['start'].get('date')
            holidays[start] = event['summary']
            print(f"Tamil Holiday found: {start} - {event['summary']}")
            
        return holidays
    except Exception as e:
        print(f"Error fetching Tamil holidays: {str(e)}")
        return {}

def is_weekend(date_str):
    """Return True if the given date is a weekend (Saturday or Sunday)"""
    date_obj = datetime.strptime(date_str, '%Y-%m-%d')
    return date_obj.weekday() >= 5

async def calculate_occupancy_rate(db, check_in_date, check_out_date):
    """Calculate occupancy rate based on actual bookings in the database"""
    start_date = datetime.strptime(check_in_date, '%Y-%m-%d')
    end_date = datetime.strptime(check_out_date, '%Y-%m-%d')
    
    # Get total room count
    total_rooms = await db.rooms.count_documents({})
    if total_rooms == 0:
        return 0.6  # Default if no rooms in database
    
    # Get bookings that overlap with the date range
    bookings = await db.bookings.find({
        "$or": [
            {
                "check_in": {"$lte": check_out_date},
                "check_out": {"$gte": check_in_date}
            }
        ]
    }).to_list(length=None)
    
    # Calculate occupancy for each day in the range
    days = (end_date - start_date).days
    if days <= 0:
        return 0.6
    
    total_occupancy = 0
    current_date = start_date
    
    while current_date < end_date:
        date_str = current_date.strftime('%Y-%m-%d')
        # Count bookings active on this date
        active_bookings = sum(1 for booking in bookings if 
                             booking['check_in'] <= date_str <= booking['check_out'])
        
        day_occupancy = active_bookings / total_rooms
        
        # Add weekend boost if applicable
        if is_weekend(date_str):
            day_occupancy = min(1.0, day_occupancy + 0.2)
            
        total_occupancy += day_occupancy
        current_date += timedelta(days=1)
    
    return total_occupancy / days

# Pricing factors (fallback multipliers)
PRICING_FACTORS = {
    "holiday_multiplier": 1.5,
    "weekend_multiplier": 1.2,
    "low_occupancy_discount": 0.9,
    "high_occupancy_premium": 1.2,
}

# Base room prices
ROOM_BASE_PRICES = {
    0: 2499,  # Standard Single
    1: 3999,  # Standard Double
    2: 5599,  # Deluxe
    3: 7499,  # Suite
    4: 14599  # Presidential Suite
}

def fancy_round(price):
    """Round price to nearest 99/98 ending"""
    # Round to nearest hundred first
    base = round(price / 100) * 100
    
    # If original price is higher than base, use 99
    # If lower, use 98 from previous hundred
    if price > base:
        return base + 99
    else:
        return (base - 100) + 99

@app.get("/api/rooms", response_model=List[dict])
async def get_rooms(
    check_in: str = None,
    check_out: str = None,
    db=Depends(get_db)
):
    """Get all rooms with dynamic availability based on date range"""
    try:
        rooms = await db.rooms.find().to_list(length=None)
        
        if not rooms:
            default_rooms = [
                {
                    "room_id": 1,
                    "type": "Standard Single",
                    "base_price": 2499,
                    "total_rooms": 5,
                    "description": "Cozy room with a single bed, perfect for solo travelers.",
                    "amenities": ["Free Wi-Fi", "TV", "Air Conditioning", "Work Desk", "Daily Housekeeping"],
                    "capacity": 1,
                    "image_url": "https://images.unsplash.com/photo-1566665797739-1674de7a421a?ixlib=rb-4.0.3"
                },
                {
                    "room_id": 2,
                    "type": "Standard Double",
                    "base_price": 3999,
                    "total_rooms": 8,
                    "description": "Comfortable room with a queen-size bed, ideal for couples.",
                    "amenities": ["Free Wi-Fi", "TV", "Air Conditioning", "Mini Fridge", "Coffee Maker", "Work Desk", "Daily Housekeeping"],
                    "capacity": 2,
                    "image_url": "https://images.unsplash.com/photo-1590490360182-c33d57733427?ixlib=rb-4.0.3"
                },
                {
                    "room_id": 3,
                    "type": "Deluxe",
                    "base_price": 5599,
                    "total_rooms": 4,
                    "description": "Spacious deluxe room with premium amenities and city views.",
                    "amenities": ["Free Wi-Fi", "Large TV", "Air Conditioning", "Mini Fridge", "Coffee Maker", "Room Service", "City View", "Premium Toiletries"],
                    "capacity": 2,
                    "image_url": "https://images.unsplash.com/photo-1578683010236-d716f9a3f461?ixlib=rb-4.0.3"
                },
                {
                    "room_id": 4,
                    "type": "Suite",
                    "base_price": 7499,
                    "total_rooms": 2,
                    "description": "Luxurious suite with separate living area and premium amenities.",
                    "amenities": ["Free Wi-Fi", "Large TV", "Air Conditioning", "Mini Bar", "Room Service", "Jacuzzi", "City View", "Premium Toiletries", "Separate Living Area"],
                    "capacity": 3,
                    "image_url": "https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?ixlib=rb-4.0.3"
                },
                {
                    "room_id": 5,
                    "type": "Presidential Suite",
                    "base_price": 14599,
                    "total_rooms": 1,
                    "description": "Our most exclusive accommodation with panoramic views and luxury amenities.",
                    "amenities": ["Free Wi-Fi", "Large TV", "Air Conditioning", "Full Bar", "24/7 Room Service", "Jacuzzi", "Private Balcony", "Panoramic View", "Butler Service", "Private Dining"],
                    "capacity": 4,
                    "image_url": "https://images.unsplash.com/photo-1631049307264-da0ec9d70304?ixlib=rb-4.0.3"
                }
            ]
            
            # Drop existing rooms collection and create new one
            await db.rooms.drop()
            await db.rooms.insert_many(default_rooms)
            rooms = default_rooms

        # If date range is provided, calculate availability
        if check_in and check_out:
            # Get all bookings that overlap with the date range
            bookings = await db.bookings.find({
                "$or": [
                    {
                        "check_in": {"$lte": check_out},
                        "check_out": {"$gte": check_in}
                    }
                ]
            }).to_list(length=None)

            # Calculate availability for each room
            for room in rooms:
                total_rooms = room.get('total_rooms', 0)
                # Count bookings for this room type in the date range
                occupied = sum(1 for booking in bookings if booking['room_id'] == room['room_id'])
                room['available'] = total_rooms - occupied
                room['occupied_count'] = occupied
        else:
            # Without date range, show total capacity
            for room in rooms:
                room['available'] = room.get('total_rooms', 0)
                room['occupied_count'] = 0

        for room in rooms:
            if "_id" in room:
                room["_id"] = str(room["_id"])
        
        return rooms
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/dynamic-pricing", response_model=List[RoomPricing])
async def get_dynamic_pricing(
    check_in: str = Query(..., description="Check-in date (YYYY-MM-DD)"),
    check_out: str = Query(..., description="Check-out date (YYYY-MM-DD)"),
    db=Depends(get_db)
):
    """Dynamic pricing endpoint using Random Forest model for prediction with holiday relevance."""
    try:
        # Validate dates
        try:
            check_in_date = datetime.strptime(check_in, '%Y-%m-%d')
            check_out_date = datetime.strptime(check_out, '%Y-%m-%d')
            if check_in_date >= check_out_date:
                raise HTTPException(status_code=400, detail="Check-out date must be after check-in date")
            if (check_out_date - check_in_date).days > 30:
                raise HTTPException(status_code=400, detail="Date range too large. Maximum is 30 days.")
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD")
        
        # Get holiday data and occupancy rate
        try:
            holidays = await get_holidays(check_in, check_out)
        except Exception as e:
            holidays = {}
            
        try:
            occupancy_rate = await calculate_occupancy_rate(db, check_in, check_out)
        except Exception as e:
            occupancy_rate = 0.6
        
        # Get rooms from database
        rooms = await db.rooms.find().to_list(length=None)
        if not rooms:
            raise HTTPException(status_code=404, detail="No rooms found in database")
        
        result = []
        
        for room in rooms:
            try:
                room_id = room["room_id"]
                base_price = room["base_price"]
                
                # Calculate features for the model
                check_in_obj = datetime.strptime(check_in, '%Y-%m-%d')
                check_out_obj = datetime.strptime(check_out, '%Y-%m-%d')
                
                # Calculate number of nights
                total_nights = (check_out_obj - check_in_obj).days
                
                # Calculate weekend and week nights
                weekend_nights = 0
                week_nights = 0
                current_date = check_in_obj
                
                while current_date < check_out_obj:
                    if current_date.weekday() >= 5:  # Saturday (5) or Sunday (6)
                        weekend_nights += 1
                    else:
                        week_nights += 1
                    current_date += timedelta(days=1)
                
                # Check if any date in the range is a holiday
                is_holiday = 0
                current_date = check_in_obj
                while current_date < check_out_obj:
                    date_str = current_date.strftime('%Y-%m-%d')
                    if date_str in holidays:
                        is_holiday = 1
                        break
                    current_date += timedelta(days=1)
                
                # Prepare the feature vector for the Random Forest model
                # Note: room_id is used as room_type (0-4)
                features = pd.DataFrame({
                    'year': [check_in_obj.year],
                    'day': [check_in_obj.day],
                    'month': [check_in_obj.month],
                    'weekend_nights': [weekend_nights],
                    'week_nights': [week_nights],
                    'room_type': [room_id - 1],
                    'is_Holiday': [is_holiday]
                })
                
                # If model loaded correctly, use it. Otherwise, fallback to rule-based pricing.
                if rf_model is not None:
                    try:
                        predicted_price = rf_model.predict(features)[0]
                        final_price = fancy_round(predicted_price)
                        factors = {
                            "model": "random_forest",
                            "year": check_in_obj.year,
                            "month": check_in_obj.month,
                            "weekend_nights": weekend_nights,
                            "week_nights": week_nights,
                            "room_type": room_id - 1,
                            "is_holiday": bool(is_holiday)
                        }
                    except Exception as e:
                        # Fallback to rule-based pricing
                        final_price = base_price
                        factors = {"model": "fallback", "error": str(e)}
                else:
                    # Fallback rule-based pricing logic
                    final_price = base_price
                    factors = {"model": "fallback"}
                    if is_holiday:
                        final_price *= PRICING_FACTORS["holiday_multiplier"]
                        factors["holiday"] = PRICING_FACTORS["holiday_multiplier"]
                    elif weekend_nights > 0:
                        final_price *= PRICING_FACTORS["weekend_multiplier"]
                        factors["weekend"] = PRICING_FACTORS["weekend_multiplier"]
                    else:
                        if occupancy_rate < 0.5:
                            final_price *= PRICING_FACTORS["low_occupancy_discount"]
                            factors["low_occupancy"] = PRICING_FACTORS["low_occupancy_discount"]
                        elif occupancy_rate > 0.8:
                            final_price *= PRICING_FACTORS["high_occupancy_premium"]
                            factors["high_occupancy"] = PRICING_FACTORS["high_occupancy_premium"]
                    final_price = fancy_round(final_price)
                
                result.append(RoomPricing(
                    room_id=room_id,
                    price=final_price,
                    base_price=base_price,
                    price_factors=factors
                ))
            except Exception as e:
                continue  # Skip this room and continue with others
        
        if not result:
            raise HTTPException(status_code=500, detail="No valid room prices could be calculated")
            
        return result
    
    except HTTPException as he:
        raise he
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error calculating dynamic prices: {str(e)}")

@app.get("/api/room-stats")
async def get_room_stats(db=Depends(get_db)):
    """Get current room statistics"""
    try:
        # Get all rooms
        rooms = await db.rooms.find().to_list(length=None)
        
        if not rooms:
            # If no rooms exist, initialize them first
            await get_rooms(db)
            rooms = await db.rooms.find().to_list(length=None)
        
        # Calculate statistics
        total_rooms = sum(room["available"] + room["occupied_count"] for room in rooms)
        occupied_rooms = sum(room["occupied_count"] for room in rooms)
        occupancy_rate = round((occupied_rooms / total_rooms) * 100) if total_rooms > 0 else 0
        
        return {
            "totalRooms": total_rooms,
            "occupiedRooms": occupied_rooms,
            "occupancyRate": occupancy_rate
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/bookings", status_code=201)
async def create_booking(booking: Booking, db=Depends(get_db)):
    """Create a new booking"""
    try:
        # Check if room exists and has availability for the requested dates
        room = await db.rooms.find_one({"room_id": booking.room_id})
        if not room:
            raise HTTPException(status_code=404, detail=f"Room with ID {booking.room_id} not found")
        
        # Check availability for the requested dates
        overlapping_bookings = await db.bookings.count_documents({
            "room_id": booking.room_id,
            "check_in": {"$lte": booking.check_out},
            "check_out": {"$gte": booking.check_in}
        })
        
        if overlapping_bookings >= room.get('total_rooms', 0):
            raise HTTPException(status_code=400, detail="Room is not available for the selected dates")
        
        # Create booking record
        booking_record = booking.dict()
        booking_record["created_at"] = datetime.now().isoformat()
        
        # Insert booking
        result = await db.bookings.insert_one(booking_record)
        
        # Send confirmation email
        email_sent = await send_booking_confirmation_email(booking_record, room)
        
        return {
            "id": str(result.inserted_id), 
            "message": "Booking confirmed",
            "email_sent": email_sent
        }
    
    except HTTPException as he:
        raise he
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error creating booking: {str(e)}")

@app.get("/api/bookings", response_model=List[dict])
async def get_bookings(db=Depends(get_db)):
    """Get all bookings (admin endpoint)"""
    bookings = await db.bookings.find().to_list(length=None)
    return bookings

@app.get("/api/next-available-dates")
async def get_next_available_dates(db=Depends(get_db)):
    """Get next available dates for rooms that are currently sold out"""
    try:
        # Get all rooms
        rooms = await db.rooms.find().to_list(length=None)
        
        if not rooms:
            # Initialize rooms if none exist
            await get_rooms(db)
            rooms = await db.rooms.find().to_list(length=None)
        
        # Get all current bookings
        bookings = await db.bookings.find().to_list(length=None)
        
        next_available_dates = {}
        
        for room in rooms:
            room_id = room["room_id"]
            total_rooms = room.get("total_rooms", 0)
            
            # Get all bookings for this room
            room_bookings = [b for b in bookings if b["room_id"] == room_id]
            
            if not room_bookings:
                continue
            
            # Sort bookings by check-out date
            room_bookings.sort(key=lambda x: datetime.strptime(x["check_out"], '%Y-%m-%d'))
            
            # Count overlapping bookings for the latest date
            latest_checkout = datetime.strptime(room_bookings[-1]["check_out"], '%Y-%m-%d')
            overlapping_bookings = sum(1 for b in room_bookings 
                                     if datetime.strptime(b["check_out"], '%Y-%m-%d') >= latest_checkout)
            
            # Only add to next_available_dates if all rooms are booked
            if overlapping_bookings >= total_rooms:
                next_available = latest_checkout + timedelta(days=1)
                next_available_dates[room_id] = next_available.strftime('%Y-%m-%d')
        
        return next_available_dates
    except Exception as e:
        print(f"Error in get_next_available_dates: {str(e)}")  # Add logging
        return {}  # Return empty dict instead of raising error

@app.get("/api/test-holidays")
async def test_holidays():
    """Test endpoint to check if Google Calendar API is working with Tamil holidays"""
    try:
        # Test with Pongal 2024 date range
        holidays = await get_holidays('2024-01-14', '2024-01-17')
        
        # Add more detailed response
        return {
            "status": "success",
            "holidays_found": len(holidays),
            "holidays": holidays,
            "message": "Testing Tamil holidays calendar. Should include Pongal festival dates if working correctly.",
            "date_range_tested": {
                "start": "2024-01-14",
                "end": "2024-01-17"
            }
        }
    except Exception as e:
        return {
            "status": "error",
            "error": str(e),
            "message": "Failed to fetch Tamil holidays"
        }

# Add this function to send emails
async def send_booking_confirmation_email(booking_data, room_details):
    """Send booking confirmation email to guest"""
    try:
        smtp_email = os.getenv('SMTP_EMAIL')
        smtp_password = os.getenv('SMTP_APP_PASSWORD')
        
        if not smtp_email or not smtp_password:
            raise ValueError("Email credentials not found in environment variables")

        msg = MIMEMultipart('alternative')
        msg['From'] = smtp_email
        msg['To'] = booking_data['guest_details']['email']
        msg['Subject'] = f'Booking Confirmation - {room_details["type"]}'

        # HTML email template with modern design
        html = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
                @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600&display=swap');
                body {{
                    font-family: 'Inter', sans-serif;
                    line-height: 1.6;
                    margin: 0;
                    padding: 0;
                    background-color: #f4f4f5;
                }}
                .container {{
                    max-width: 600px;
                    margin: 20px auto;
                    background: white;
                    border-radius: 12px;
                    overflow: hidden;
                    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
                }}
                .header {{
                    background: linear-gradient(135deg, #1e40af, #3b82f6);
                    color: white;
                    padding: 40px 20px;
                    text-align: center;
                }}
                .content {{
                    padding: 30px;
                }}
                .booking-id {{
                    background: rgba(255, 255, 255, 0.1);
                    padding: 8px 15px;
                    border-radius: 20px;
                    font-size: 14px;
                    margin-top: 10px;
                    display: inline-block;
                }}
                .section {{
                    margin: 25px 0;
                    padding: 20px;
                    background: #f8fafc;
                    border-radius: 8px;
                }}
                .section-title {{
                    color: #1e40af;
                    font-size: 18px;
                    font-weight: 600;
                    margin-bottom: 15px;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                }}
                .detail-row {{
                    display: flex;
                    justify-content: space-between;
                    margin: 8px 0;
                    font-size: 15px;
                }}
                .label {{
                    color: #64748b;
                }}
                .value {{
                    color: #0f172a;
                    font-weight: 600;
                }}
                .important-info {{
                    background: #fef3c7;
                    padding: 15px;
                    border-radius: 8px;
                    margin: 20px 0;
                }}
                .footer {{
                    text-align: center;
                    padding: 20px;
                    background: #f8fafc;
                    color: #64748b;
                    font-size: 14px;
                }}
                .button {{
                    display: inline-block;
                    padding: 12px 24px;
                    background: #2563eb;
                    color: white;
                    text-decoration: none;
                    border-radius: 6px;
                    font-weight: 600;
                    margin: 20px 0;
                }}
                .amenities-grid {{
                    display: grid;
                    grid-template-columns: repeat(2, 1fr);
                    gap: 12px;
                    margin-top: 15px;
                }}
                .amenity {{
                    display: flex;
                    align-items: center;
                    background: #f0f9ff;
                    color: #0369a1;
                    padding: 8px 12px;
                    border-radius: 8px;
                    font-size: 13px;
                    gap: 8px;
                }}
                .amenity-icon {{
                    color: #0ea5e9;
                    font-size: 16px;
                }}
                .contact-section {{
                    text-align: center;
                    padding: 24px;
                    background: #f8fafc;
                    border-radius: 8px;
                    margin: 20px 0;
                }}
                .contact-section .section-title {{
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    margin-bottom: 20px;
                    text-align: center;
                    width: 100%;
                }}
                .contact-section .section-title span {{
                    display: inline-block;
                    text-align: center;
                }}
                .contact-info {{
                    font-size: 15px;
                    line-height: 1.8;
                    color: #334155;
                    text-align: center;
                }}
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>Booking Confirmed! 🎉</h1>
                    <div class="booking-id">Booking ID: #{str(booking_data.get('_id', 'TMP-' + datetime.now().strftime('%Y%m%d')))}</div>
                </div>
                
                <div class="content">
                    <p>Dear {booking_data['guest_name']},</p>
                    <p>Thank you for choosing Luxe Resorts. Your reservation has been successfully confirmed.</p>
                    
                    <div class="section">
                        <div class="section-title">
                            <span>🏨 Room Details</span>
                        </div>
                        <div class="detail-row">
                            <span class="label">Room Type : </span>
                            <span class="value"> {room_details['type']}</span>
                        </div>
                        <div class="detail-row">
                            <span class="label">Number of Guests : </span>
                            <span class="value"> {booking_data['guests']} Guest(s)</span>
                        </div>
                        <div class="amenities-grid">
                            {' '.join(f'''
                                <div class="amenity">
                                    <span class="amenity-icon">✦ </span>
                                     {amenity}
                                </div>
                            ''' for amenity in room_details.get('amenities', []))}
                        </div>
                    </div>

                    <div class="section">
                        <div class="section-title">
                            <span>📅 Stay Duration</span>
                        </div>
                        <div class="detail-row">
                            <span class="label">Check-in : </span>
                            <span class="value"> {booking_data['check_in']} (from 2:00 PM)</span>
                        </div>
                        <div class="detail-row">
                            <span class="label">Check-out : </span>
                            <span class="value"> {booking_data['check_out']} (until 11:00 AM)</span>
                        </div>
                    </div>

                    <div class="section">
                        <div class="section-title">
                            <span>💰 Payment Details</span>
                        </div>
                        <div class="detail-row">
                            <span class="label">Price per Night : </span>
                            <span class="value"> ₹{booking_data['price_per_night']:,.2f}</span>
                        </div>
                        <div class="detail-row">
                            <span class="label">Total Amount : </span>
                            <span class="value"> ₹{booking_data['total_price']:,.2f}</span>
                        </div>
                    </div>

                    <div class="important-info">
                        <div class="section-title">
                            <span>ℹ️ Important Information</span>
                        </div>
                        <ul style="margin: 0; padding-left: 20px;">
                            <li>Please present a valid ID and the credit card used for booking during check-in</li>
                            <li>Early check-in and late check-out are subject to availability</li>
                            <li>Free cancellation available up to 24 hours before check-in</li>
                            <li>Free WiFi available throughout the property</li>
                        </ul>
                    </div>

                    <div style="text-align: center;">
                        <a href="#" class="button" style="text-decoration: none; color: white;">View or Modify Booking</a>
                    </div>

                    <div class="contact-section">
                        <div class="section-title" style="text-align: center; width: 100%;">
                            <span style="margin: 0 auto;">📍 Contact Information</span>
                        </div>
                        <div class="contact-info">
                            <strong>Hotel Dynamic Pricing</strong><br>
                            123 Hotel Street<br>
                            City Name, State 600001<br>
                            <br>
                            📞 <a href="tel:+911234567890" style="color: #2563eb; text-decoration: none;">+91 1234567890</a><br>
                            ✉️ <a href="mailto:support@hotel.com" style="color: #2563eb; text-decoration: none;">support@hotel.com</a>
                        </div>
                    </div>
                </div>

                <div class="footer">
                    <p>Need help? Contact our 24/7 customer support</p>
                    <div style="margin-top: 15px;">
                        <a href="#" style="color: #2563eb; margin: 0 10px;">Facebook</a>
                        <a href="#" style="color: #2563eb; margin: 0 10px;">Twitter</a>
                        <a href="#" style="color: #2563eb; margin: 0 10px;">Instagram</a>
                    </div>
                    <p style="margin-top: 20px; font-size: 12px;">
                        This email was sent to {booking_data['guest_details']['email']}.<br>
                        © 2024 Hotel Name. All rights reserved.
                    </p>
                </div>
            </div>
        </body>
        </html>
        """

        # Attach both plain text and HTML versions
        msg.attach(MIMEText(html, 'html'))

        # Create SMTP session and send email
        server = smtplib.SMTP('smtp.gmail.com', 587)
        server.starttls()
        server.login(smtp_email, smtp_password)
        server.send_message(msg)
        server.quit()
        
        return True
    except Exception as e:
        print(f"Error sending email: {str(e)}")
        return False

@app.post("/api/test-email")
async def test_email(email: str):
    """Test endpoint for email functionality"""
    try:
        test_booking = {
            "guest_name": "Test User",
            "guest_details": {
                "email": email,
                "phone": "1234567890",
                "address": "Test Address"
            },
            "check_in": "2024-01-01",
            "check_out": "2024-01-03",
            "guests": 2,
            "price_per_night": 2499,
            "total_price": 4998
        }
        
        test_room = {
            "type": "Standard Room",
            "description": "Test Room"
        }
        
        email_sent = await send_booking_confirmation_email(test_booking, test_room)
        return {"success": email_sent, "message": "Test email sent successfully" if email_sent else "Failed to send test email"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
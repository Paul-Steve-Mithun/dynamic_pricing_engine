import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { format, addDays, differenceInDays } from 'date-fns';

const debounce = (func, wait) => {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
};

const style = document.createElement('style');
style.textContent = `
  @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;500;600;700&family=Poppins:wght@300;400;500;600&display=swap');

  .pattern-bg {
    background-image: url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%239C92AC' fill-opacity='0.05'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E");
  }

  .luxury-font {
    font-family: 'Playfair Display', serif;
  }

  .modern-font {
    font-family: 'Poppins', sans-serif;
  }

  .text-gradient {
    background: linear-gradient(to right, #1a365d, #3182ce);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
  }

  .royal-button {
    background: linear-gradient(135deg, #2c5282, #1a365d);
    color: white;
    border: 1px solid rgba(255, 255, 255, 0.1);
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06),
                inset 0 1px 0 rgba(255, 255, 255, 0.1);
    transition: all 0.3s ease;
  }

  .royal-button:hover {
    background: linear-gradient(135deg, #1a365d, #2c5282);
    transform: translateY(-2px);
    box-shadow: 0 6px 12px -2px rgba(0, 0, 0, 0.15), 0 3px 6px -2px rgba(0, 0, 0, 0.1),
                inset 0 1px 0 rgba(255, 255, 255, 0.15);
  }

  .royal-button:disabled {
    background: linear-gradient(135deg, #718096, #4a5568);
    cursor: not-allowed;
    transform: none;
  }

  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  @keyframes fadeOut {
    from { opacity: 1; }
    to { opacity: 0; }
  }

  @keyframes modalSlideIn {
    from {
      transform: translateY(50px);
      opacity: 0;
    }
    to {
      transform: translateY(0);
      opacity: 1;
    }
  }

  @keyframes modalSlideOut {
    from {
      transform: translateY(0);
      opacity: 1;
    }
    to {
      transform: translateY(50px);
      opacity: 0;
    }
  }

  .animate-fadeIn {
    animation: fadeIn 0.3s ease-out;
  }

  .animate-fadeOut {
    animation: fadeOut 0.3s ease-out;
  }

  .animate-modalSlideIn {
    animation: modalSlideIn 0.3s ease-out;
  }

  .animate-modalSlideOut {
    animation: modalSlideOut 0.3s ease-out;
  }

  .modal-open {
    overflow: hidden;
  }

  .modal-backdrop {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-color: rgba(0, 0, 0, 0.6);
    backdrop-filter: blur(4px);
  }

  .modal-content {
    position: relative;
    background-color: white;
    border-radius: 0.75rem;
    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
  }
`;
document.head.appendChild(style);

const HOTEL_ADDRESSES = {
  "Madurai": {
    street: "45 West Masi Street",
    area: "Near Meenakshi Temple",
    city: "Madurai",
    state: "Tamil Nadu",
    pincode: "625001",
    phone: "+91 452-2345-6789"
  },
  "Hyderabad": {
    street: "8-2-120 Road No. 2",
    area: "Banjara Hills",
    city: "Hyderabad",
    state: "Telangana",
    pincode: "500034",
    phone: "+91 40-6789-0123"
  },
  "Bangalore": {
    street: "123 MG Road",
    area: "Central Business District",
    city: "Bangalore",
    state: "Karnataka",
    pincode: "560001",
    phone: "+91 80-3456-7890"
  }
};

const Rooms = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const searchParams = location.state?.searchParams || {
    checkIn: format(new Date(), 'yyyy-MM-dd'),
    checkOut: format(addDays(new Date(), 1), 'yyyy-MM-dd'),
    guests: 1,
    roomType: '',
    location: ''
  };

  // States
  const [rooms, setRooms] = useState([]);
  const [selectedRoom, setSelectedRoom] = useState(null);
  const [isBookingModalOpen, setIsBookingModalOpen] = useState(false);
  const [formData, setFormData] = useState({
    guestName: '',
    location: '',
    ...searchParams
  });
  const [loading, setLoading] = useState(false);
  const [bookingSuccess, setBookingSuccess] = useState(false);
  const [recommendedRoom, setRecommendedRoom] = useState(null);
  const [filteredRooms, setFilteredRooms] = useState([]);
  const [searchPerformed, setSearchPerformed] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [roomAvailability, setRoomAvailability] = useState({});
  const [nextAvailableDates, setNextAvailableDates] = useState({});
  const [nextAvailableDatesLoading, setNextAvailableDatesLoading] = useState(false);
  const [formErrors, setFormErrors] = useState({});
  const [availableRoomTypes, setAvailableRoomTypes] = useState([]);
  const [roomsLoading, setRoomsLoading] = useState(true);

  // Functions
  const fetchAllData = async (checkIn, checkOut, location) => {
    try {
      const params = { 
        check_in: checkIn, 
        check_out: checkOut
      };
      
      // Only add location to params if it's not empty
      if (location && location.trim()) {
        params.location = location;
      }

      const [roomsResponse, pricingResponse, nextDatesResponse] = await Promise.all([
        axios.get('http://localhost:8000/api/rooms', { params }),
        axios.get('http://localhost:8000/api/dynamic-pricing', {
          params: { 
            check_in: checkIn, 
            check_out: checkOut 
          }
        }),
        axios.get('http://localhost:8000/api/next-available-dates')
      ]);

      // Process rooms data
      const updatedRooms = roomsResponse.data.map(room => {
        const pricing = pricingResponse.data.find(p => p.room_id === room.room_id);
        return {
          id: room.room_id,
          type: room.type,
          basePrice: room.base_price,
          currentPrice: pricing ? pricing.price : room.base_price,
          available: room.available,
          occupiedCount: room.occupied_count,
          totalRooms: room.total_rooms,
          amenities: room.amenities,
          description: room.description,
          image_url: room.image_url,
          priceFactors: pricing ? pricing.price_factors : {},
          location: room.location,
          capacity: room.capacity
        };
      });

      setRooms(updatedRooms);
      setNextAvailableDates(nextDatesResponse.data);

      // Update room types
      const uniqueRoomTypes = [...new Set(updatedRooms.map(room => room.type))];
      setAvailableRoomTypes(uniqueRoomTypes);

      // Set recommended room
      const bestValue = updatedRooms
        .filter(room => room.available > 0)
        .reduce((best, room) => {
          const priceDiff = (room.currentPrice - room.basePrice) / room.basePrice;
          if (!best || priceDiff < best.priceDiff) {
            return { room, priceDiff };
          }
          return best;
        }, null);

      if (bestValue) {
        setRecommendedRoom(bestValue.room);
      }

      return updatedRooms;
    } catch (error) {
      throw error;
    }
  };

  const debouncedFetchAllData = debounce(fetchAllData, 300);

  const loadInitialData = async () => {
    setRoomsLoading(true);
    try {
      await fetchAllData(formData.checkIn, formData.checkOut, formData.location);
    } finally {
      setRoomsLoading(false);
    }
  };

  useEffect(() => {
    loadInitialData();
  }, [formData.checkIn, formData.checkOut, formData.location]);

  useEffect(() => {
    if (!roomsLoading) {
      const intervalId = setInterval(() => {
        fetchAllData(formData.checkIn, formData.checkOut, formData.location);
      }, 60000);
      
      return () => clearInterval(intervalId);
    }
  }, [roomsLoading, formData.checkIn, formData.checkOut, formData.location]);

  useEffect(() => {
    if (rooms.length > 0) {
      let filtered = [...rooms];
      
      if (formData.roomType) {
        filtered = filtered.filter(room => room.type === formData.roomType);
      }
      
      filtered = filtered.filter(room => {
        const capacities = {
          'Standard Single': 1,
          'Standard Double': 2,
          'Deluxe': 2,
          'Suite': 3,
          'Presidential Suite': 4
        };
        return capacities[room.type] >= formData.guests;
      });
      
      filtered = filtered.filter(room => room.available > 0);
      
      setFilteredRooms(filtered);
    }
  }, [rooms, formData.roomType, formData.guests]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prevData => {
      const newData = { ...prevData, [name]: value };
      setFormErrors({});
      
      if (name === 'checkIn' || name === 'checkOut') {
        const checkInDate = new Date(name === 'checkIn' ? value : prevData.checkIn);
        const checkOutDate = new Date(name === 'checkOut' ? value : prevData.checkOut);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        if (isNaN(checkInDate.getTime()) || isNaN(checkOutDate.getTime())) {
          return newData;
        }

        if (checkInDate < today) {
          setFormErrors(prev => ({ ...prev, checkIn: 'Check-in date cannot be in the past' }));
        }
        
        if (checkOutDate <= checkInDate) {
          setFormErrors(prev => ({ ...prev, checkOut: 'Check-out date must be after check-in date' }));
        }
      }
      
      return newData;
    });
  };

  const handleSearch = async () => {
    try {
      const errors = {};
      if (!formData.location) {
        errors.location = 'Please select a location';
      }
      
      const checkInDate = new Date(formData.checkIn);
      const checkOutDate = new Date(formData.checkOut);
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      if (checkInDate < today) {
        errors.checkIn = 'Check-in date cannot be in the past';
      }
      if (checkOutDate <= checkInDate) {
        errors.checkOut = 'Check-out date must be after check-in date';
      }

      if (Object.keys(errors).length > 0) {
        setFormErrors(errors);
        return;
      }

      setLoading(true);
      setSearchPerformed(true);

      const updatedRooms = await fetchAllData(formData.checkIn, formData.checkOut, formData.location);
      setFilteredRooms(updatedRooms);
    } catch (error) {
      alert('An error occurred while searching. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleBookNow = (room) => {
    if (!room) return;
    console.log('Opening modal for room:', room);
    setSelectedRoom(room);
    setIsBookingModalOpen(true);
    setIsClosing(false);
    setBookingSuccess(false);
  };

  const handleSubmitBooking = async () => {
    try {
      const updatedRooms = await fetchAllData(formData.checkIn, formData.checkOut, formData.location);
      const currentRoom = updatedRooms.find(r => r.id === selectedRoom.id);
      
      const checkIn = new Date(formData.checkIn);
      const checkOut = new Date(formData.checkOut);
      const nights = Math.max(1, differenceInDays(checkOut, checkIn));
      const totalPrice = currentRoom.currentPrice * nights;
      
      setIsBookingModalOpen(false);
      
      navigate('/booking-confirmation', {
        state: {
          room: currentRoom,
          formData: {
            ...formData,
            location: currentRoom.location
          },
          nights,
          totalPrice
        }
      });
    } catch (error) {
      alert("There was an error preparing your booking. Please try again.");
    }
  };

  const closeModal = () => {
    setIsClosing(true);
    setTimeout(() => {
      setIsBookingModalOpen(false);
      setIsClosing(false);
      setSelectedRoom(null);
    }, 300);
  };

  // Utility functions
  const getPriceDiffDisplay = (currentPrice, basePrice) => {
    const priceDiff = currentPrice - basePrice;
    if (priceDiff === 0) return null;
    
    return (
      <span className={`text-xs font-medium ${priceDiff > 0 ? 'text-[#2c5282]' : 'text-green-600'}`}>
        {priceDiff > 0 ? '+' : '-'}₹{Math.abs(priceDiff)}
      </span>
    );
  };

  const getPricingExplanation = (priceFactors) => {
    if (!priceFactors || Object.keys(priceFactors).length === 0) return null;
    
    if (priceFactors.has_holiday) {
      return <span className="text-red-600 text-xs">Holiday pricing</span>;
    } else if (priceFactors.has_weekend) {
      return <span className="text-red-600 text-xs">Weekend pricing</span>;
    } else if (priceFactors.low_occupancy) {
      return <span className="text-green-600 text-xs">Low occupancy discount</span>;
    } else if (priceFactors.high_occupancy) {
      return <span className="text-red-600 text-xs">High demand</span>;
    }
    
    return null;
  };

  // Components
  const RoomAvailabilityStatus = ({ room }) => {
    const getAvailabilityColor = (available) => {
      if (available === 0) return 'text-red-600';
      if (available <= 2) return 'text-orange-600';
      return 'text-green-600';
    };

    return (
      <div className="flex items-center space-x-1">
        <span className={`${getAvailabilityColor(room.available)} font-medium`}>
          {room.available}
        </span>
        <span className="text-gray-500">
          {room.available === 1 ? 'room' : 'rooms'} left
        </span>
        {room.available <= 2 && room.available > 0 && (
          <span className="text-orange-600 text-sm">
            (Limited availability)
          </span>
        )}
      </div>
    );
  };

  const NextAvailableDate = ({ roomId }) => {
    const nextDate = nextAvailableDates[roomId];
    
    if (nextAvailableDatesLoading) {
      return (
        <div className="text-sm text-gray-600 font-medium mt-1">
          Loading next available date...
        </div>
      );
    }
    
    if (!nextDate) return null;
    
    return (
      <div className="text-sm text-green-600 font-medium mt-1">
        Next available: {format(new Date(nextDate), 'MMM dd, yyyy')}
      </div>
    );
  };

  // Add this effect to handle body scroll when modal is open
  useEffect(() => {
    if (isBookingModalOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isBookingModalOpen]);

  return (
    <>
      <div className="min-h-screen pattern-bg">
        <div className="h-[50px]"></div> {/* Spacer div */}
        {/* Search Form */}
        <div className="max-w-7xl mx-auto px-4 relative z-20 mb-16">
          <div className="bg-white rounded-xl shadow-2xl overflow-hidden">
            <div className="p-4 md:p-8">
              <h2 className="text-3xl md:text-4xl font-bold luxury-font text-gradient mb-4 md:mb-6">
                Find Your Perfect Stay
              </h2>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-5 md:gap-6">
                {/* Location select */}
                <div>
                  <label htmlFor="location" className="block text-sm font-medium text-gray-700 mb-2">Location</label>
                  <select
                    id="location"
                    name="location"
                    value={formData.location}
                    onChange={handleInputChange}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 cursor-pointer hover:border-blue-500 bg-white"
                    required
                  >
                    <option value="">Select Location</option>
                    <option value="Madurai">Madurai</option>
                    <option value="Hyderabad">Hyderabad</option>
                    <option value="Bangalore">Bangalore</option>
                  </select>
                </div>

                {/* Check-in input */}
                <div>
                  <label htmlFor="checkIn" className="block text-sm font-medium text-gray-700 mb-2">Check-in Date</label>
                  <input
                    type="date"
                    id="checkIn"
                    name="checkIn"
                    value={formData.checkIn}
                    onChange={handleInputChange}
                    min={format(new Date(), 'yyyy-MM-dd')}
                    className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 cursor-pointer hover:border-blue-500 ${
                      formErrors.checkIn ? 'border-red-500' : 'border-gray-300'
                    }`}
                  />
                  {formErrors.checkIn && (
                    <p className="mt-1 text-sm text-red-600">{formErrors.checkIn}</p>
                  )}
                </div>

                {/* Check-out input */}
                <div>
                  <label htmlFor="checkOut" className="block text-sm font-medium text-gray-700 mb-2">Check-out Date</label>
                  <input
                    type="date"
                    id="checkOut"
                    name="checkOut"
                    value={formData.checkOut}
                    onChange={handleInputChange}
                    min={format(addDays(new Date(formData.checkIn), 1), 'yyyy-MM-dd')}
                    className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 cursor-pointer hover:border-blue-500 ${
                      formErrors.checkOut ? 'border-red-500' : 'border-gray-300'
                    }`}
                  />
                  {formErrors.checkOut && (
                    <p className="mt-1 text-sm text-red-600">{formErrors.checkOut}</p>
                  )}
                </div>

                {/* Guests select */}
                <div>
                  <label htmlFor="guests" className="block text-sm font-medium text-gray-700 mb-2">Guests</label>
                  <select
                    id="guests"
                    name="guests"
                    value={formData.guests}
                    onChange={handleInputChange}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 cursor-pointer hover:border-blue-500 bg-white"
                  >
                    {[1, 2, 3, 4].map(num => (
                      <option key={num} value={num}>{num} {num === 1 ? 'Guest' : 'Guests'}</option>
                    ))}
                  </select>
                </div>

                {/* Room Type select */}
                <div>
                  <label htmlFor="roomType" className="block text-sm font-medium text-gray-700 mb-2">Room Type</label>
                  <select
                    id="roomType"
                    name="roomType"
                    value={formData.roomType}
                    onChange={handleInputChange}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 cursor-pointer hover:border-blue-500 bg-white"
                  >
                    <option value="">Any Room Type</option>
                    <option value="Standard Single">Standard Single</option>
                    <option value="Standard Double">Standard Double</option>
                    <option value="Deluxe">Deluxe</option>
                    <option value="Suite">Suite</option>
                    <option value="Presidential Suite">Presidential Suite</option>
                  </select>
                </div>
              </div>

              <div className="mt-6 flex justify-center">
                <button
                  onClick={handleSearch}
                  disabled={loading || formErrors.checkIn || formErrors.checkOut || !formData.location}
                  className="royal-button px-8 py-3 rounded-full text-lg font-medium focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
                >
                  {loading ? (
                    <div className="flex items-center">
                      <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Searching...
                    </div>
                  ) : (
                    'Search Availability'
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Update recommended room section */}
        {recommendedRoom && (
          <div className="py-16 md:py-24 bg-gradient-to-b from-white/50 to-blue-50/50 backdrop-blur-sm">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <h2 className="text-3xl md:text-4xl font-bold luxury-font text-gradient mb-2">Recommended for You</h2>
              <p className="text-gray-600 mb-8 md:mb-12 modern-font text-lg">Based on your search, we recommend this room for the best value.</p>
              
              <div className="bg-white/90 backdrop-blur-sm rounded-xl shadow-2xl overflow-hidden">
                <div className="flex flex-col md:flex-row">
                  <div className="w-full md:w-1/3 h-64 md:h-auto relative">
                    <img 
                      src={recommendedRoom.image_url} 
                      alt={recommendedRoom.type} 
                      className="h-full w-full object-cover"
                    />
                    {recommendedRoom.currentPrice < recommendedRoom.basePrice && (
                      <div className="absolute top-0 left-0 m-4">
                        <div className="relative">
                          <div className="relative bg-gradient-to-r from-red-500 to-pink-500 text-white px-3 py-1.5 rounded-full font-bold shadow-lg transform hover:scale-105 transition-transform duration-200 cursor-pointer flex items-center">
                            <span className="text-lg">{Math.round(((recommendedRoom.basePrice - recommendedRoom.currentPrice) / recommendedRoom.basePrice) * 100)}%</span>
                            <span className="ml-0.5 text-xs">OFF</span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="p-4 md:p-8 w-full md:w-2/3">
                    <div className="flex flex-col sm:flex-row justify-between items-start mb-4">
                      <div className="w-full">
                        <h3 className="text-xl md:text-2xl font-bold luxury-font text-gradient text-left">{recommendedRoom.type}</h3>
                        <div className="mt-1 flex items-center">
                          {Array(5).fill().map((_, i) => {
                            const rating = Math.min(5, 3.5 + ((recommendedRoom.id || 1) * 0.3));
                            return (
                              <svg key={i} className={`h-4 w-4 ${i < rating ? 'text-yellow-400' : 'text-gray-300'}`} fill="currentColor" viewBox="0 0 20 20">
                                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                              </svg>
                            );
                          })}
                          <span className="ml-2 text-gray-600 text-sm">
                            {(Math.min(5, 3.5 + ((recommendedRoom.id || 1) * 0.3))).toFixed(1)} out of 5
                          </span>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-gray-500 line-through text-sm">₹{recommendedRoom.basePrice}</div>
                        <div className="text-lg md:text-2xl font-bold text-[#2c5282]">
                          ₹{recommendedRoom.currentPrice} {getPriceDiffDisplay(recommendedRoom.currentPrice, recommendedRoom.basePrice)}
                        </div>
                        {getPricingExplanation(recommendedRoom.priceFactors)}
                      </div>
                    </div>
                    
                    <p className="text-gray-600 mb-4">{recommendedRoom.description}</p>
                    
                    {/* Update amenities display */}
                    <div className="mb-4">
                      <h4 className="text-sm font-medium text-gray-900 mb-2">Amenities:</h4>
                      <div className="flex flex-wrap gap-1 md:gap-2">
                        {recommendedRoom.amenities.map((amenity, index) => (
                          <span key={index} className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                            {amenity}
                          </span>
                        ))}
                      </div>
                    </div>
                    
                    {/* Update booking section */}
                    <div className="mt-auto pt-4 border-t border-gray-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-0">
                      <span className="text-sm text-gray-500">
                        {recommendedRoom.available} {recommendedRoom.available === 1 ? 'room' : 'rooms'} left
                      </span>
                      <button
                        onClick={() => handleBookNow(recommendedRoom)}
                        className="royal-button px-6 py-3 rounded-lg font-medium"
                      >
                        Book This Room
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
        
        {/* Update available rooms grid */}
        <div id="rooms" className="max-w-7xl mx-auto px-4 py-16 md:py-24 sm:px-6 lg:px-8">
          <h2 className="text-3xl md:text-4xl font-bold luxury-font text-gradient mb-8 md:mb-12">Available Rooms</h2>
          
          {roomsLoading ? (
            <div className="flex justify-center items-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-8 md:gap-10 md:grid-cols-2 lg:grid-cols-3">
              {(searchPerformed ? filteredRooms : rooms).map((room) => (
                <div key={room.id} 
                  className="bg-white/90 backdrop-blur-sm rounded-xl shadow-lg overflow-hidden 
                  transition-all duration-500 hover:shadow-2xl hover:-translate-y-2 flex flex-col">
                  {/* Update room card content */}
                  <div className="relative h-48 sm:h-64">
                    {loading ? (
                      <div className="absolute inset-0 bg-gray-100 animate-pulse" />
                    ) : (
                      <img 
                        src={room.image_url} 
                        alt={room.type} 
                        className="w-full h-full object-cover"
                      />
                    )}
                    {room.currentPrice < room.basePrice && (
                      <div className="absolute top-0 left-0 m-4">
                        <div className="relative">
                          <div className="relative bg-gradient-to-r from-red-500 to-pink-500 text-white px-2.5 py-1 rounded-full font-bold shadow-lg transform hover:scale-105 transition-transform duration-200 cursor-pointer flex items-center">
                            <span className="text-base">{Math.round(((room.basePrice - room.currentPrice) / room.basePrice) * 100)}%</span>
                            <span className="ml-0.5 text-xs">OFF</span>
                          </div>
                        </div>
                      </div>
                    )}
                    {room.available === 0 && (
                      <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center">
                        <span className="text-white text-xl font-bold">Sold Out</span>
                      </div>
                    )}
                    <div className="absolute top-4 right-4 bg-white px-3 py-1 rounded-full text-sm font-medium text-[#2c5282]">
                      ₹{room.currentPrice}/night
                    </div>
                  </div>
                  <div className="p-6 flex flex-col flex-grow">
                    <div className="flex flex-col sm:flex-row justify-between items-start mb-4">
                      <div className="w-full">
                        <h3 className="text-xl font-bold luxury-font text-gradient text-left">{room.type}</h3>
                        <div className="mt-1 flex items-center">
                          {Array(5).fill().map((_, i) => {
                            const rating = Math.min(5, 3.5 + ((room.id || 1) * 0.3));
                            return (
                              <svg key={i} className={`h-4 w-4 ${i < rating ? 'text-yellow-400' : 'text-gray-300'}`} fill="currentColor" viewBox="0 0 20 20">
                                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                              </svg>
                            );
                          })}
                          <span className="ml-2 text-gray-600 text-sm">
                            {(Math.min(5, 3.5 + ((room.id || 1) * 0.3))).toFixed(1)} out of 5
                          </span>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-gray-500 line-through text-sm">₹{room.basePrice}</div>
                        <div className="text-lg font-bold text-[#2c5282]">
                          {loading ? (
                            <div className="h-6 w-24 bg-gray-200 animate-pulse rounded" />
                          ) : (
                            <>₹{room.currentPrice} {getPriceDiffDisplay(room.currentPrice, room.basePrice)}</>
                          )}
                        </div>
                        {getPricingExplanation(room.priceFactors)}
                      </div>
                    </div>
                    
                    <p className="text-gray-600 modern-font mb-4">{room.description}</p>
                    
                    {/* Update amenities display */}
                    <div className="mb-4">
                      <h4 className="text-sm font-medium text-gray-900 mb-2">Amenities:</h4>
                      <div className="flex flex-wrap gap-1 md:gap-2">
                        {room.amenities.map((amenity, index) => (
                          <span key={index} className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                            {amenity}
                          </span>
                        ))}
                      </div>
                    </div>
                    
                    {/* Update booking section */}
                    <div className="mt-auto pt-4 border-t border-gray-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-0">
                      <div>
                        <RoomAvailabilityStatus room={room} />
                        {room.available === 0 && <NextAvailableDate roomId={room.id} />}
                      </div>
                      <button 
                        onClick={() => handleBookNow(room)}
                        disabled={room.available === 0}
                        className={`min-w-[100px] px-4 py-2 rounded-lg text-center ${
                          room.available === 0 
                            ? 'bg-gray-300 cursor-not-allowed' 
                            : 'royal-button'
                        }`}
                      >
                        {room.available === 0 ? 'Sold Out' : 'Book Now'}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      
      {/* Move modal outside the main container */}
      {(isBookingModalOpen || isClosing) && selectedRoom && (
        <div className={`fixed inset-0 flex items-center justify-center p-2 md:p-4 z-[9999] ${
          isClosing ? 'animate-fadeOut' : 'animate-fadeIn'
        }`}>
          <div 
            className="fixed inset-0 bg-black/60 backdrop-blur-sm" 
            onClick={closeModal}
          ></div>
          <div 
            className={`bg-white rounded-xl shadow-2xl w-full max-w-md mx-2 relative ${
              isClosing ? 'animate-modalSlideOut' : 'animate-modalSlideIn'
            }`}
          >
            <div className="p-4 md:p-6">
              {bookingSuccess ? (
                <div className="text-center py-8">
                  <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-green-100">
                    <svg className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <h3 className="mt-3 text-lg font-medium text-gray-900">Booking Confirmed!</h3>
                  <p className="mt-2 text-sm text-gray-500">
                    Thank you for your booking. We look forward to welcoming you soon.
                  </p>
                </div>
              ) : (
                <>
                  <div className="flex justify-between items-start">
                    <h2 className="text-lg font-medium text-gray-900">Book Your Stay</h2>
                    <button 
                      onClick={closeModal}
                      className="text-gray-400 hover:text-gray-500"
                    >
                      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                  
                  <div className="mt-4 flex items-center">
                    <img 
                      src={selectedRoom.image_url} 
                      alt={selectedRoom.type} 
                      className="h-16 w-16 object-cover rounded-md"
                    />
                    <div className="ml-4">
                      <h3 className="text-lg font-medium text-gray-900">{selectedRoom.type}</h3>
                      <p className="text-sm text-[#2c5282] font-medium">
                        ₹{selectedRoom.currentPrice}/night ({selectedRoom.amenities.slice(0, 2).join(", ")}
                        {selectedRoom.amenities.length > 2 ? ", ..." : ""})
                      </p>
                      <p className="text-gray-600 text-sm mt-1">
                        {selectedRoom.description}
                      </p>
                    </div>
                  </div>
                  
                  <form className="space-y-4 mt-6">
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Guest Name</label>
                      <input
                        type="text"
                        name="guestName"
                        value={formData.guestName}
                        onChange={handleInputChange}
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border"
                        required
                      />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700">Check-in Date</label>
                        <input
                          type="date"
                          name="checkIn"
                          value={formData.checkIn}
                          onChange={handleInputChange}
                          min={format(new Date(), 'yyyy-MM-dd')}
                          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700">Check-out Date</label>
                        <input
                          type="date"
                          name="checkOut"
                          value={formData.checkOut}
                          onChange={handleInputChange}
                          min={format(addDays(new Date(formData.checkIn), 1), 'yyyy-MM-dd')}
                          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border"
                          required
                        />
                      </div>
                    </div>
                    <div>
                      <label htmlFor="guests" className="block text-sm font-medium text-gray-700">
                        Number of Guests
                      </label>
                      <select
                        id="guests"
                        name="guests"
                        value={formData.guests}
                        onChange={handleInputChange}
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                        required
                      >
                        {Array.from({ length: selectedRoom.capacity }, (_, i) => (
                          <option key={i + 1} value={i + 1}>{i + 1}</option>
                        ))}
                      </select>
                    </div>
                    
                    {formData.checkIn && formData.checkOut && (
                      <div className="bg-gray-50 p-4 rounded-lg">
                        <h4 className="font-medium text-gray-800">Price Summary</h4>
                        {(() => {
                          const checkIn = new Date(formData.checkIn);
                          const checkOut = new Date(formData.checkOut);
                          const nights = Math.max(1, differenceInDays(checkOut, checkIn));
                          const totalPrice = selectedRoom.currentPrice * nights;
                          
                          return (
                            <div className="text-sm space-y-2 mt-2">
                              <div className="flex justify-between">
                                <span className="text-gray-600">₹{selectedRoom.currentPrice} × {nights} night{nights !== 1 ? 's' : ''}</span>
                                <span className="font-medium">₹{totalPrice}</span>
                              </div>
                              <div className="border-t border-gray-200 pt-2 mt-2">
                                <div className="flex justify-between font-medium">
                                  <span>Total</span>
                                  <span>₹{totalPrice}</span>
                                </div>
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                    )}
                    
                    <div className="flex justify-end space-x-3 pt-4">
                      <button
                        type="button"
                        onClick={closeModal}
                        className="px-4 py-2 bg-gray-100 text-gray-800 rounded hover:bg-gray-200 border border-gray-300 transition-all duration-300"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={handleSubmitBooking}
                        className="royal-button px-4 py-2 rounded disabled:opacity-50 disabled:cursor-not-allowed"
                        disabled={!formData.guestName || !formData.checkIn || !formData.checkOut || loading}
                      >
                        {loading ? 'Processing...' : 'Confirm Booking'}
                      </button>
                    </div>
                  </form>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default Rooms;
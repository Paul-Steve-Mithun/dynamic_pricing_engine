import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { format, addDays, differenceInDays, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, addMonths, subMonths } from 'date-fns';
import { useNavigate } from 'react-router-dom';

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

const HotelManagementSystem = () => {
  const [rooms, setRooms] = useState([]);
  const [selectedRoom, setSelectedRoom] = useState(null);
  const [isBookingModalOpen, setIsBookingModalOpen] = useState(false);
  const [formData, setFormData] = useState({
    guestName: '',
    location: '',
    checkIn: format(new Date(), 'yyyy-MM-dd'),
    checkOut: format(addDays(new Date(), 1), 'yyyy-MM-dd'),
    guests: 1,
    roomType: ''
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

  const navigate = useNavigate();

  const [formErrors, setFormErrors] = useState({});
  const [availableRoomTypes, setAvailableRoomTypes] = useState([]);

  const [roomsLoading, setRoomsLoading] = useState(true);

  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const slideInStyles = {
    transform: 'translateX(-100%)',
    transition: 'transform 0.3s ease-in-out'
  };

  const [isVisible, setIsVisible] = useState({
    maldives: true,
    swiss: true,
    dubai: true
  });

  const fetchAllData = async (checkIn, checkOut, location) => {
    try {
      const [roomsResponse, pricingResponse, nextDatesResponse] = await Promise.all([
        axios.get('https://dynamic-pricing-engine-bknd.onrender.com/api/rooms', {
          params: {
            check_in: checkIn,
            check_out: checkOut,
            location: location
          }
        }),
        axios.get('https://dynamic-pricing-engine-bknd.onrender.com/api/dynamic-pricing', {
          params: { 
            check_in: checkIn, 
            check_out: checkOut 
          }
        }),
        axios.get('https://dynamic-pricing-engine-bknd.onrender.com/api/next-available-dates')
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
          location: room.location
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

  const handleBookNow = (room) => {
    setSelectedRoom(room);
    setIsBookingModalOpen(true);
  };

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
      
      // Navigate to rooms page with search parameters including location
      navigate('/rooms', {
        state: {
          searchParams: formData
        }
      });
    } catch (error) {
      alert('An error occurred while searching. Please try again.');
    } finally {
      setLoading(false);
    }
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
          formData,
          nights,
          totalPrice
        }
      });
    } catch (error) {
      alert("There was an error preparing your booking. Please try again.");
    }
  };

  const getPriceDiffDisplay = (currentPrice, basePrice) => {
    const priceDiff = currentPrice - basePrice;
    if (priceDiff === 0) return null;
    
    return (
      <span className={`text-xs font-medium ${priceDiff > 0 ? 'text-red-600' : 'text-green-600'}`}>
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

  const closeModal = () => {
    setIsClosing(true);
    setTimeout(() => {
      setIsBookingModalOpen(false);
      setIsClosing(false);
    }, 300);
  };

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

  // First, update the keyframes in your style declaration
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

    .hover-zoom {
      transition: transform 0.5s ease;
    }

    .hover-zoom:hover {
      transform: scale(1.05);
    }

    .text-gradient {
      background: linear-gradient(to right, #1a365d, #3182ce);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }

    .card-shine {
      position: relative;
      overflow: hidden;
    }

    .card-shine::after {
      content: '';
      position: absolute;
      top: -50%;
      left: -50%;
      width: 200%;
      height: 200%;
      background: linear-gradient(
        to bottom right,
        rgba(255, 255, 255, 0) 0%,
        rgba(255, 255, 255, 0.1) 50%,
        rgba(255, 255, 255, 0) 100%
      );
      transform: rotate(45deg);
      transition: all 0.3s;
      opacity: 0;
    }

    .card-shine:hover::after {
      opacity: 1;
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

    .royal-button-outline {
      background: transparent;
      color: #2c5282;
      border: 1px solid #2c5282;
      transition: all 0.3s ease;
    }

    .royal-button-outline:hover {
      background: linear-gradient(135deg, #2c5282, #1a365d);
      color: white;
      transform: translateY(-2px);
    }
  `;
  document.head.appendChild(style);

  const handleLocationClick = (selectedLocation) => {
    navigate('/rooms', { 
      state: { 
        searchParams: {
          checkIn: format(new Date(), 'yyyy-MM-dd'),
          checkOut: format(addDays(new Date(), 1), 'yyyy-MM-dd'),
          guests: 1,
          location: selectedLocation
        }
      }
    });
  };

  return (
    <div className="relative">
      {/* Hero Section */}
      <div className="h-[110vh] relative">
        <div className="absolute inset-0 overflow-hidden">
          <img 
            src="hotel.jpg" 
            alt="Luxury Hotel" 
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/50 to-black/70"></div>
        </div>
        
        <div className="relative z-10 h-full flex flex-col justify-center items-center text-center px-4">
          <h1 className="text-3xl sm:text-5xl md:text-7xl font-bold text-white mb-4 font-serif">
            Experience Luxury <span className="text-blue-400">Redefined</span>
          </h1>
          <p className="text-base sm:text-lg md:text-xl text-gray-200 max-w-3xl mb-8">
            Discover the perfect blend of comfort and elegance with our dynamic pricing system that ensures you always get the best value.
          </p>
        </div>
      </div>

      {/* Search Form - Moved up and adjusted positioning */}
      <div className="max-w-7xl mx-auto px-4 relative z-20 -mt-32 mb-16">
        <div className="bg-white rounded-xl shadow-2xl overflow-hidden">
          <div className="p-4 md:p-8">
            <h2 className="text-3xl font-bold luxury-font text-gradient mb-4 md:mb-6">Find Your Perfect Stay</h2>
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
                {formErrors.location && (
                  <p className="mt-1 text-sm text-red-600">{formErrors.location}</p>
                )}
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

      {/* Services Section */}
      <div className="py-24 pattern-bg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold luxury-font text-gradient mb-6">
              Experience Luxury at Its Finest
            </h2>
            <p className="text-xl modern-font text-gray-600 max-w-3xl mx-auto">
              Indulge in world-class amenities and personalized service that sets us apart from the ordinary.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-12 mt-12">
            <div className="bg-white rounded-2xl overflow-hidden shadow-2xl card-shine transform transition-all duration-300 hover:-translate-y-2">
              <div className="relative overflow-hidden">
                <img 
                  src="spa.jpg" 
                  alt="Luxury Spa" 
                  className="h-72 w-full object-cover transform hover:scale-110 transition-transform duration-700"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent"></div>
                <h3 className="absolute bottom-4 left-6 text-2xl font-bold text-white luxury-font">Wellness & Spa</h3>
              </div>
              <div className="p-8">
                <p className="text-gray-600 modern-font leading-relaxed">
                  Rejuvenate your senses with our world-class spa treatments and wellness programs.
                </p>
              </div>
            </div>

            <div className="bg-white rounded-2xl overflow-hidden shadow-2xl card-shine transform transition-all duration-300 hover:-translate-y-2">
              <div className="relative overflow-hidden">
                <img 
                  src="Dining.jpg" 
                  alt="Fine Dining" 
                  className="h-72 w-full object-cover transform hover:scale-110 transition-transform duration-700"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent"></div>
                <h3 className="absolute bottom-4 left-6 text-2xl font-bold text-white luxury-font">Fine Dining</h3>
              </div>
              <div className="p-8">
                <p className="text-gray-600 modern-font leading-relaxed">
                  Savor exquisite cuisines prepared by our award-winning chefs using the finest ingredients.
                </p>
              </div>
            </div>

            <div className="bg-white rounded-2xl overflow-hidden shadow-2xl card-shine transform transition-all duration-300 hover:-translate-y-2">
              <div className="relative overflow-hidden">
                <img 
                  src="event.jpg" 
                  alt="Event Spaces" 
                  className="h-72 w-full object-cover transform hover:scale-110 transition-transform duration-700"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent"></div>
                <h3 className="absolute bottom-4 left-6 text-2xl font-bold text-white luxury-font">Event Spaces</h3>
              </div>
              <div className="p-8">
                <p className="text-gray-600 modern-font leading-relaxed">
                  Perfect venues for your special occasions, meetings, and celebrations.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Corporate Discount Section */}
      <div className="py-16 bg-gradient-to-r from-blue-50 to-indigo-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <h2 className="text-4xl md:text-5xl font-bold luxury-font text-gradient mb-6">
              Corporate Group Discounts
            </h2>
            <p className="text-xl modern-font text-gray-600 max-w-3xl mx-auto">
              Special rates for corporate groups and business travelers
            </p>
          </div>

          <div className="mt-12 grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {/* Tier 1 */}
            <div className="relative group">
              <div className="absolute -inset-0.5 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-lg blur opacity-25 group-hover:opacity-50 transition duration-200"></div>
              <div className="relative bg-white p-8 rounded-lg shadow-lg hover:shadow-xl transition-all duration-300">
                <div className="flex items-center justify-between">
                  <div className="flex-shrink-0 bg-blue-100 rounded-lg p-3">
                    <svg className="h-8 w-8 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                    </svg>
                  </div>
                  <span className="text-3xl font-bold text-blue-600">15%</span>
                </div>
                <h3 className="mt-4 text-xl font-semibold text-gray-900">Small Groups</h3>
                <p className="mt-2 text-gray-600">For groups of 3-5 members</p>
                <div className="mt-4 border-t border-gray-100 pt-4">
                  <span className="text-sm text-gray-500">Perfect for small team meetings and events</span>
                </div>
              </div>
            </div>

            {/* Tier 2 */}
            <div className="relative group">
              <div className="absolute -inset-0.5 bg-gradient-to-r from-indigo-600 to-purple-600 rounded-lg blur opacity-25 group-hover:opacity-50 transition duration-200"></div>
              <div className="relative bg-white p-8 rounded-lg shadow-lg hover:shadow-xl transition-all duration-300">
                <div className="flex items-center justify-between">
                  <div className="flex-shrink-0 bg-indigo-100 rounded-lg p-3">
                    <svg className="h-8 w-8 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                    </svg>
                  </div>
                  <span className="text-3xl font-bold text-indigo-600">25%</span>
                </div>
                <h3 className="mt-4 text-xl font-semibold text-gray-900">Medium Groups</h3>
                <p className="mt-2 text-gray-600">For groups of 5-10 members</p>
                <div className="mt-4 border-t border-gray-100 pt-4">
                  <span className="text-sm text-gray-500">Ideal for corporate retreats and conferences</span>
                </div>
              </div>
            </div>

            {/* Tier 3 */}
            <div className="relative group">
              <div className="absolute -inset-0.5 bg-gradient-to-r from-purple-600 to-pink-600 rounded-lg blur opacity-25 group-hover:opacity-50 transition duration-200"></div>
              <div className="relative bg-white p-8 rounded-lg shadow-lg hover:shadow-xl transition-all duration-300">
                <div className="flex items-center justify-between">
                  <div className="flex-shrink-0 bg-purple-100 rounded-lg p-3">
                    <svg className="h-8 w-8 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <span className="text-3xl font-bold text-purple-600">30%</span>
                </div>
                <h3 className="mt-4 text-xl font-semibold text-gray-900">Large Groups</h3>
                <p className="mt-2 text-gray-600">For groups of 10+ members</p>
                <div className="mt-4 border-t border-gray-100 pt-4">
                  <span className="text-sm text-gray-500">Best value for large corporate events</span>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-10 text-center">
            <p className="text-gray-600 modern-font">
              Contact our corporate sales team for customized packages and additional benefits
            </p>
            <button
              onClick={() => navigate('/rooms')}
              className="royal-button mt-10 px-8 py-4 rounded-full text-lg modern-font font-medium"
            >
              Enquire Now
            </button>
          </div>
        </div>
      </div>

      {/* Locations Section */}
      <div className="py-24 bg-gradient-to-b from-white to-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold luxury-font text-gradient mb-6">
              Our Exclusive Locations
            </h2>
            <p className="text-xl modern-font text-gray-600 max-w-3xl mx-auto">
              Experience luxury across South India's most vibrant cities, each offering a unique blend of tradition and modern comfort.
            </p>
          </div>

          {/* Madurai Heritage */}
          <div className="flex flex-col lg:flex-row items-center mb-32 animate-[fadeInLeft_1s_ease-out]">
            <div className="w-full lg:w-1/2 lg:pr-12">
              <div className="relative h-[600px] rounded-3xl overflow-hidden group card-shine">
                <img 
                  src="madurai.jpg" 
                  alt="Madurai Heritage" 
                  className="w-full h-full object-cover transform group-hover:scale-110 transition-transform duration-1000"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent"></div>
              </div>
            </div>
            <div className="w-full lg:w-1/2 mt-12 lg:mt-0 lg:pl-12">
              <h3 className="text-4xl font-bold luxury-font text-gradient mb-6">Madurai Heritage</h3>
              <p className="text-xl modern-font text-gray-600 leading-relaxed mb-8">
                Immerse yourself in the cultural capital of Tamil Nadu, where ancient tradition meets modern luxury.
              </p>
              <div className="space-y-6">
                <div className="flex items-center gap-4 p-4 bg-white rounded-xl shadow-sm hover:shadow-md transition-all duration-300">
                  <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center">
                    <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/>
                    </svg>
                  </div>
                  <span className="text-lg modern-font text-gray-700">Temple View Rooms</span>
                </div>
                <div className="flex items-center gap-4 p-4 bg-white rounded-xl shadow-sm hover:shadow-md transition-all duration-300">
                  <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center">
                    <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 15.546c-.523 0-1.046.151-1.5.454a2.704 2.704 0 01-3 0 2.704 2.704 0 00-3 0 2.704 2.704 0 01-3 0 2.704 2.704 0 00-3 0 2.701 2.701 0 00-1.5-.454M9 6v2m3-2v2m3-2v2M9 3h.01M12 3h.01M15 3h.01M21 21v-7a2 2 0 00-2-2H5a2 2 0 00-2 2v7h18zm-3-9v-2a2 2 0 00-2-2H8a2 2 0 00-2 2v2h12z"/>
                    </svg>
                  </div>
                  <span className="text-lg modern-font text-gray-700">Traditional Tamil Cuisine</span>
                </div>
                <div className="flex items-center gap-4 p-4 bg-white rounded-xl shadow-sm hover:shadow-md transition-all duration-300">
                  <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center">
                    <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
                    </svg>
                  </div>
                  <span className="text-lg modern-font text-gray-700">Cultural Tours & Experiences</span>
                </div>
              </div>
              <button className="royal-button mt-10 px-8 py-4 rounded-full text-lg modern-font font-medium">
                Explore Madurai
              </button>
            </div>
          </div>

          {/* Hyderabad Grandeur */}
          <div className="flex flex-col-reverse lg:flex-row items-center mb-32 animate-[fadeInRight_1s_ease-out]">
            <div className="w-full lg:w-1/2 mt-8 lg:mt-0 lg:pr-12">
              <h3 className="text-4xl font-bold luxury-font text-gradient mb-6">Hyderabad Grandeur</h3>
              <p className="text-xl modern-font text-gray-600 leading-relaxed mb-8">
                Experience the royal heritage of the Nizams in our luxurious resort, where Hyderabadi hospitality meets contemporary comfort in the heart of the city of pearls.
              </p>
              <div className="space-y-6">
                <div className="flex items-center gap-4 p-4 bg-white rounded-xl shadow-sm hover:shadow-md transition-all duration-300">
                  <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center">
                    <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"/>
                    </svg>
                  </div>
                  <span className="text-lg modern-font text-gray-700">Rooftop Infinity Pool</span>
                </div>
                <div className="flex items-center gap-4 p-4 bg-white rounded-xl shadow-sm hover:shadow-md transition-all duration-300">
                  <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center">
                    <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 15.546c-.523 0-1.046.151-1.5.454a2.704 2.704 0 01-3 0 2.704 2.704 0 00-3 0 2.704 2.704 0 01-3 0 2.704 2.704 0 00-3 0 2.704 2.704 0 01-3 0 2.701 2.701 0 00-1.5-.454M9 6v2m3-2v2m3-2v2M9 3h.01M12 3h.01M15 3h.01M21 21v-7a2 2 0 00-2-2H5a2 2 0 00-2 2v7h18zm-3-9v-2a2 2 0 00-2-2H8a2 2 0 00-2 2v2h12z"/>
                    </svg>
                  </div>
                  <span className="text-lg modern-font text-gray-700">Authentic Hyderabadi Cuisine</span>
                </div>
                <div className="flex items-center gap-4 p-4 bg-white rounded-xl shadow-sm hover:shadow-md transition-all duration-300">
                  <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center">
                    <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/>
                    </svg>
                  </div>
                  <span className="text-lg modern-font text-gray-700">Heritage Walking Tours</span>
                </div>
              </div>
              <button className="royal-button mt-10 px-8 py-4 rounded-full text-lg modern-font font-medium">
                Discover Hyderabad
              </button>
            </div>
            <div className="w-full lg:w-1/2">
              <div className="relative h-[600px] rounded-2xl overflow-hidden group">
                <img 
                  src="hyderabad.jpg" 
                  alt="Hyderabad Grandeur" 
                  className="w-full h-full object-cover transform group-hover:scale-110 transition-transform duration-700"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent"></div>
              </div>
            </div>
          </div>

          {/* Bangalore Tech Garden */}
          <div className="flex flex-col lg:flex-row items-center animate-[fadeInLeft_1s_ease-out]">
            <div className="w-full lg:w-1/2 lg:pr-12">
              <div className="relative h-[600px] rounded-3xl overflow-hidden group card-shine">
                <img 
                  src="bangalore.jpg" 
                  alt="Bangalore Tech Garden" 
                  className="w-full h-full object-cover transform group-hover:scale-110 transition-transform duration-1000"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent"></div>
              </div>
            </div>
            <div className="w-full lg:w-1/2 mt-12 lg:mt-0 lg:pl-12">
              <h3 className="text-4xl font-bold luxury-font text-gradient mb-6">Bangalore Tech Garden</h3>
              <p className="text-xl modern-font text-gray-600 leading-relaxed mb-8">
                Stay in the heart of India's Silicon Valley, where modern luxury meets garden city charm. Perfect for both business travelers and leisure seekers.
              </p>
              <div className="space-y-6">
                <div className="flex items-center gap-4 p-4 bg-white rounded-xl shadow-sm hover:shadow-md transition-all duration-300">
                  <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center">
                    <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/>
                    </svg>
                  </div>
                  <span className="text-lg modern-font text-gray-700">Smart Business Center</span>
                </div>
                <div className="flex items-center gap-4 p-4 bg-white rounded-xl shadow-sm hover:shadow-md transition-all duration-300">
                  <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center">
                    <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"/>
                    </svg>
                  </div>
                  <span className="text-lg modern-font text-gray-700">Rooftop Garden Restaurant</span>
                </div>
                <div className="flex items-center gap-4 p-4 bg-white rounded-xl shadow-sm hover:shadow-md transition-all duration-300">
                  <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center">
                    <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"/>
                    </svg>
                  </div>
                  <span className="text-lg modern-font text-gray-700">Tech-enabled Workspaces</span>
                </div>
              </div>
              <button className="royal-button mt-10 px-8 py-4 rounded-full text-lg modern-font font-medium">
                Explore Bangalore
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Features Section */}
      <div className="py-24 pattern-bg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12">
            <div className="bg-white rounded-2xl p-8 shadow-lg hover:shadow-2xl transition-all duration-300 card-shine">
              <div className="w-16 h-16 mx-auto mb-6 bg-blue-100 rounded-full flex items-center justify-center">
                <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h3 className="text-xl font-bold luxury-font text-gray-900 mb-4">Best Price Guarantee</h3>
              <p className="text-gray-600 modern-font">Dynamic pricing ensures you always get the best available rates</p>
            </div>

            <div className="bg-white rounded-2xl p-8 shadow-lg hover:shadow-2xl transition-all duration-300 card-shine">
              <div className="w-16 h-16 mx-auto mb-6 bg-blue-100 rounded-full flex items-center justify-center">
                <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              <h3 className="text-xl font-bold luxury-font text-gray-900 mb-4">Secure Booking</h3>
              <p className="text-gray-600 modern-font">Safe and secure payment processing</p>
            </div>

            <div className="bg-white rounded-2xl p-8 shadow-lg hover:shadow-2xl transition-all duration-300 card-shine">
              <div className="w-16 h-16 mx-auto mb-6 bg-blue-100 rounded-full flex items-center justify-center">
                <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                </svg>
              </div>
              <h3 className="text-xl font-bold luxury-font text-gray-900 mb-4">Prime Locations</h3>
              <p className="text-gray-600 modern-font">Handpicked destinations for the perfect stay</p>
            </div>

            <div className="bg-white rounded-2xl p-8 shadow-lg hover:shadow-2xl transition-all duration-300 card-shine">
              <div className="w-16 h-16 mx-auto mb-6 bg-blue-100 rounded-full flex items-center justify-center">
                <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h3 className="text-xl font-bold luxury-font text-gray-900 mb-4">24/7 Support</h3>
              <p className="text-gray-600 modern-font">Round-the-clock assistance for our guests</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default HotelManagementSystem;
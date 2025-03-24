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

  const fetchAllData = async (checkIn, checkOut) => {
    try {
      const [roomsResponse, pricingResponse, nextDatesResponse] = await Promise.all([
        axios.get('https://dynamic-pricing-engine-bknd.onrender.com/api/rooms', {
          params: {
            check_in: checkIn,
            check_out: checkOut
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
          priceFactors: pricing ? pricing.price_factors : {}
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
      await fetchAllData(formData.checkIn, formData.checkOut);
    } finally {
      setRoomsLoading(false);
    }
  };

  useEffect(() => {
    loadInitialData();
  }, [formData.checkIn, formData.checkOut]);

  useEffect(() => {
    if (!roomsLoading) {
      const intervalId = setInterval(() => {
        fetchAllData(formData.checkIn, formData.checkOut);
      }, 60000);
      
      return () => clearInterval(intervalId);
    }
  }, [roomsLoading, formData.checkIn, formData.checkOut]);

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

      const updatedRooms = await fetchAllData(formData.checkIn, formData.checkOut);
      setFilteredRooms(updatedRooms);

      document.getElementById('rooms')?.scrollIntoView({ behavior: 'smooth' });
    } catch (error) {
      alert('An error occurred while searching. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitBooking = async () => {
    try {
      const updatedRooms = await fetchAllData(formData.checkIn, formData.checkOut);
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

  return (
    <div className="min-h-screen flex flex-col">
      <main className="flex-grow">
        <div className="relative h-[100vh]">
          <div className="absolute inset-0 overflow-hidden">
            <img 
              src="https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=1170&q=80" 
              alt="Luxury Hotel" 
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/50 to-black/70"></div>
          </div>
          
          <nav className="relative z-10 px-6 py-4 backdrop-blur-md bg-white/10">
            <div className="max-w-7xl mx-auto">
              <div className="flex justify-between items-center">
                {/* Logo and Brand */}
                <div className="flex items-center space-x-2">
                  <div className="text-white font-serif text-2xl tracking-wider flex items-center">
                    <span className="text-3xl font-bold bg-gradient-to-r from-blue-400 to-indigo-500 text-transparent bg-clip-text">LUXE</span>
                    <span className="ml-2 text-xl text-white/90">HOTEL</span>
                  </div>
                </div>

                {/* Desktop Navigation */}
                <div className="hidden md:flex items-center space-x-1">
                  <a href="#" className="px-4 py-2 text-white/90 hover:text-white transition-colors duration-200 relative group">
                    Home
                    <span className="absolute bottom-0 left-0 w-full h-0.5 bg-blue-400 transform scale-x-0 group-hover:scale-x-100 transition-transform duration-200"></span>
                  </a>
                  <a href="#rooms" className="px-4 py-2 text-white/90 hover:text-white transition-colors duration-200 relative group">
                    Rooms
                    <span className="absolute bottom-0 left-0 w-full h-0.5 bg-blue-400 transform scale-x-0 group-hover:scale-x-100 transition-transform duration-200"></span>
                  </a>
                  <a href="#" className="px-4 py-2 text-white/90 hover:text-white transition-colors duration-200 relative group">
                    Amenities
                    <span className="absolute bottom-0 left-0 w-full h-0.5 bg-blue-400 transform scale-x-0 group-hover:scale-x-100 transition-transform duration-200"></span>
                  </a>
                  <a href="#" className="px-4 py-2 text-white/90 hover:text-white transition-colors duration-200 relative group">
                    Gallery
                    <span className="absolute bottom-0 left-0 w-full h-0.5 bg-blue-400 transform scale-x-0 group-hover:scale-x-100 transition-transform duration-200"></span>
                  </a>
                  <a href="#" className="px-4 py-2 text-white/90 hover:text-white transition-colors duration-200 relative group">
                    Contact
                    <span className="absolute bottom-0 left-0 w-full h-0.5 bg-blue-400 transform scale-x-0 group-hover:scale-x-100 transition-transform duration-200"></span>
                  </a>
                </div>

                {/* Book Now Button */}
                <div className="flex items-center space-x-4">
                  <button className="bg-gradient-to-r from-blue-500 to-indigo-600 text-white px-6 py-2.5 rounded-full hover:shadow-lg hover:from-blue-600 hover:to-indigo-700 transition-all duration-200 transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-transparent">
                    Book Now
                  </button>
                  
                  {/* Mobile Menu Button */}
                  <button className="md:hidden text-white hover:text-blue-400 transition-colors duration-200">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* Mobile Navigation Menu - Hidden by default */}
              <div className="md:hidden">
                <div className="px-2 pt-2 pb-3 space-y-1 sm:px-3 hidden">
                  <a href="#" className="block px-3 py-2 text-white/90 hover:text-white transition-colors duration-200">Home</a>
                  <a href="#rooms" className="block px-3 py-2 text-white/90 hover:text-white transition-colors duration-200">Rooms</a>
                  <a href="#" className="block px-3 py-2 text-white/90 hover:text-white transition-colors duration-200">Amenities</a>
                  <a href="#" className="block px-3 py-2 text-white/90 hover:text-white transition-colors duration-200">Gallery</a>
                  <a href="#" className="block px-3 py-2 text-white/90 hover:text-white transition-colors duration-200">Contact</a>
                </div>
              </div>
            </div>
          </nav>
          
          <div className="relative z-10 h-full flex flex-col justify-center items-center text-center px-4">
            <h1 className="text-5xl md:text-7xl font-bold text-white mb-4 font-serif">
              Experience Luxury <span className="text-blue-400">Redefined</span>
            </h1>
            <p className="text-xl text-gray-200 max-w-3xl mb-8">
              Discover the perfect blend of comfort and elegance with our dynamic pricing system that ensures you always get the best value.
            </p>
          </div>
        </div>

        <div className="relative z-20 -mt-24 mx-auto max-w-5xl px-4">
          <div className="bg-white rounded-xl shadow-2xl overflow-hidden">
            <div className="p-8">
              <h2 className="text-2xl font-bold text-gray-800 mb-6">Find Your Perfect Stay</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
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
                    {availableRoomTypes.map(type => (
                      <option key={type} value={type}>{type}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="mt-6 flex justify-center">
                <button
                  onClick={handleSearch}
                  disabled={loading || formErrors.checkIn || formErrors.checkOut}
                  className="bg-blue-600 text-white px-8 py-3 rounded-full text-lg font-medium hover:bg-blue-700 transition transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
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

        <div className="h-24"></div>

        {recommendedRoom && (
          <div className="py-16 bg-gradient-to-r from-blue-50 to-indigo-50">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <h2 className="text-3xl font-bold text-gray-900 mb-2">Recommended for You</h2>
              <p className="text-gray-600 mb-8">Based on your search, we recommend this room for the best value.</p>
              
              <div className="bg-white rounded-xl shadow-lg overflow-hidden">
                <div className="md:flex">
                  <div className="md:flex-shrink-0 md:w-1/3 relative">
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
                  <div className="p-8 md:w-2/3">
                    <div className="flex justify-between items-start">
                      <div>
                        <h3 className="text-2xl font-bold text-gray-900">{recommendedRoom.type}</h3>
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
                      <div className="text-right">
                        <div className="text-gray-500 line-through text-sm">₹{recommendedRoom.basePrice}</div>
                        <div className="text-2xl font-bold text-blue-600">
                          ₹{recommendedRoom.currentPrice} {getPriceDiffDisplay(recommendedRoom.currentPrice, recommendedRoom.basePrice)}
                        </div>
                        {getPricingExplanation(recommendedRoom.priceFactors)}
                      </div>
                    </div>
                    
                    <p className="mt-4 text-gray-600">{recommendedRoom.description}</p>
                    
                    <div className="mt-6">
                      <h4 className="text-sm font-medium text-gray-900">Amenities:</h4>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {recommendedRoom.amenities.map((amenity, index) => (
                          <span key={index} className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-800">
                            {amenity}
                          </span>
                        ))}
                      </div>
                    </div>
                    
                    <div className="mt-8 flex justify-between items-center">
                      <span className="text-sm text-gray-500">
                        {recommendedRoom.available} {recommendedRoom.available === 1 ? 'room' : 'rooms'} left
                      </span>
                      <button
                        onClick={() => handleBookNow(recommendedRoom)}
                        className="bg-blue-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-blue-700 transition transform hover:scale-105"
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
        
        <div id="rooms" className="max-w-7xl mx-auto px-4 py-16 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-gray-900 mb-8">Available Rooms</h2>
          
          {roomsLoading ? (
            <div className="flex justify-center items-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3">
              {(searchPerformed ? filteredRooms : rooms).map((room) => (
                <div key={room.id} className="bg-white rounded-xl shadow-lg overflow-hidden transition-transform hover:shadow-xl hover:-translate-y-1 flex flex-col">
                  <div className="relative h-64">
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
                    <div className="absolute top-4 right-4 bg-white px-3 py-1 rounded-full text-sm font-medium text-blue-600">
                      ₹{room.currentPrice}/night
                    </div>
                  </div>
                  <div className="p-6 flex flex-col flex-grow">
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <h3 className="text-xl font-bold text-gray-900">{room.type}</h3>
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
                      <div className="text-right">
                        <div className="text-gray-500 line-through text-sm">₹{room.basePrice}</div>
                        <div className="text-lg font-bold text-blue-600">
                          {loading ? (
                            <div className="h-6 w-24 bg-gray-200 animate-pulse rounded" />
                          ) : (
                            <>₹{room.currentPrice} {getPriceDiffDisplay(room.currentPrice, room.basePrice)}</>
                          )}
                        </div>
                        {getPricingExplanation(room.priceFactors)}
                      </div>
                    </div>
                    
                    <p className="text-gray-600 mb-4">{room.description}</p>
                    
                    <div className="mb-4">
                      <h4 className="text-sm font-medium text-gray-900 mb-2">Amenities:</h4>
                      <div className="flex flex-wrap gap-2">
                        {room.amenities.map((amenity, index) => (
                          <span key={index} className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                            {amenity}
                          </span>
                        ))}
                      </div>
                    </div>
                    
                    <div className="mt-auto pt-4 border-t border-gray-100 flex items-center justify-between">
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
                            : 'bg-blue-600 hover:bg-blue-700 text-white'
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

        {(isBookingModalOpen || isClosing) && selectedRoom && (
          <div className={`fixed inset-0 flex items-center justify-center p-4 z-50 ${isClosing ? 'animate-fadeOut' : 'animate-fadeIn'}`}>
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity duration-300"></div>
            <div className={`bg-white rounded-lg shadow-lg max-w-md w-full relative z-10 ${isClosing ? 'animate-modalSlideOut' : 'animate-modalSlideIn'}`}>
              <div className="p-6">
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
                        <p className="text-sm text-gray-500">
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
                      <div className="grid grid-cols-2 gap-4">
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
                        <label className="block text-sm font-medium text-gray-700">Number of Guests</label>
                        <select
                          name="guests"
                          value={formData.guests}
                          onChange={handleInputChange}
                          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border"
                        >
                          {[1, 2, 3, 4].map(num => (
                            <option key={num} value={num}>{num}</option>
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
                          className="px-4 py-2 bg-gray-200 text-gray-800 rounded hover:bg-gray-300"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={handleSubmitBooking}
                          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-blue-300 disabled:cursor-not-allowed"
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
      </main>

      <footer className="bg-gray-800 text-white w-full">
        <div className="max-w-7xl mx-auto py-12 px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div>
              <h3 className="text-lg font-semibold mb-4">About Our Hotel</h3>
              <p className="text-gray-300">
                Experience luxury and comfort with our dynamic pricing system that ensures you always get the best value for your stay.
              </p>
            </div>
            <div>
              <h3 className="text-lg font-semibold mb-4">Contact Us</h3>
              <p className="text-gray-300">123 Luxury Avenue</p>
              <p className="text-gray-300">New York, NY 10001</p>
              <p className="text-gray-300">Phone: (123) 456-7890</p>
              <p className="text-gray-300">Email: info@luxuryhotel.com</p>
            </div>
            <div>
              <h3 className="text-lg font-semibold mb-4">Follow Us</h3>
              <div className="flex space-x-4">
                <a href="#" className="text-gray-300 hover:text-white">
                  <svg className="h-6 w-6" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path fillRule="evenodd" d="M22 12c0-5.523-4.477-10-10-10S2 6.477 2 12c0 4.991 3.657 9.128 8.438 9.878v-6.987h-2.54V12h2.54V9.797c0-2.506 1.492-3.89 3.777-3.89 1.094 0 2.238.195 2.238.195v2.46h-1.26c-1.243 0-1.63.771-1.63 1.562V12h2.773l-.443 2.89h-2.33v6.988C18.343 21.128 22 16.991 22 12z" clipRule="evenodd" />
                  </svg>
                </a>
                <a href="#" className="text-gray-300 hover:text-white">
                  <svg className="h-6 w-6" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path fillRule="evenodd" d="M12.315 2c2.43 0 2.784.013 3.808.06 1.064.049 1.791.218 2.427.465a4.902 4.902 0 011.772 1.153 4.902 4.902 0 011.153 1.772c.247.636.416 1.363.465 2.427.048 1.067.06 1.407.06 4.123v.08c0 2.643-.012 2.987-.06 4.043-.049 1.064-.218 1.791-.465 2.427a4.902 4.902 0 01-1.153 1.772 4.902 4.902 0 01-1.772 1.153c-.636.247-1.363.416-2.427.465-1.067.048-1.407.06-4.123.06h-.08c-2.643 0-2.987-.012-4.043-.06-1.064-.049-1.791-.218-2.427-.465a4.902 4.902 0 01-1.772-1.153 4.902 4.902 0 01-1.153-1.772c-.247-.636-.416-1.363-.465-2.427-.047-1.024-.06-1.379-.06-3.808v-.63c0-2.43.013-2.784.06-3.808.049-1.064.218-1.791.465-2.427a4.902 4.902 0 011.153-1.772A4.902 4.902 0 015.45 2.525c.636-.247 1.363-.416 2.427-.465C8.901 2.013 9.256 2 11.685 2h.63zm-.081 1.802h-.468c-2.456 0-2.784.011-3.807.058-.975.045-1.504.207-1.857.344-.467.182-.8.398-1.15.748-.35.35-.566.683-.748 1.15-.137.353-.353-.3-.882-.344-1.857-.047-1.023-.058-1.351-.058-3.807v.468c0 2.456.011 2.784.058 3.807.045.975.207 1.504.344 1.857.182.466.399.748 1.15.35.35.683.566 1.15.748.353.137.882.3 1.857.344 1.054.048 1.37.058 4.041.058h.08c2.597 0 2.917-.01 3.96-.058.976-.045 1.505-.207 1.858-.344.466-.182.8-.398 1.15-.748.35-.35.566-.683.748-1.15.137-.353.3-.882.344-1.857.048-1.055.058-1.37.058-4.041v-.08c0-2.597-.01-2.917-.058-3.96-.045-.976-.207-1.505-.344-1.858a3.097 3.097 0 00-.748-1.15 3.098 3.098 0 00-1.15-.748c-.353-.137-.882-.3-1.857-.344-1.023-.047-1.351-.058-3.807-.058zM12 6.865a5.135 5.135 0 110 10.27 5.135 5.135 0 010-10.27zm0 1.802a3.333 3.333 0 100 6.666 3.333 3.333 0 000-6.666zm5.338-3.205a1.2 1.2 0 110 2.4 1.2 1.2 0 010-2.4z" clipRule="evenodd" />
                  </svg>
                </a>
                <a href="#" className="text-gray-300 hover:text-white">
                  <svg className="h-6 w-6" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M8.29 20.251c7.547 0 11.675-6.253 11.675-11.675 0-.178 0-.355-.012-.53A8.348 8.348 0 0022 5.92a8.19 8.19 0 01-2.357.646 4.118 4.118 0 001.804-2.27 8.224 8.224 0 01-2.605.996 4.107 4.107 0 00-6.993 3.743 11.65 11.65 0 01-8.457-4.287 4.106 4.106 0 001.27 5.477A4.072 4.072 0 012.8 9.713v.052a4.105 4.105 0 003.292 4.022 4.095 4.095 0 01-1.853.07 4.108 4.108 0 003.834 2.85A8.233 8.233 0 012 18.407a11.616 11.616 0 006.29 1.84" />
                  </svg>
                </a>
              </div>
            </div>
          </div>
          <div className="mt-8 border-t border-gray-700 pt-8 text-center">
            <p className="text-sm text-gray-400">
              &copy; {new Date().getFullYear()} Luxury Hotel. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default HotelManagementSystem;
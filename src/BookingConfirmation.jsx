import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { format } from 'date-fns';

const BookingConfirmation = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { room: initialRoom, formData, nights, totalPrice: initialTotalPrice } = location.state || {};
  const [loading, setLoading] = useState(false);
  const [bookingComplete, setBookingComplete] = useState(false);
  const [bookingId, setBookingId] = useState('');
  const [error, setError] = useState('');
  const [room, setRoom] = useState(initialRoom);
  const [totalPrice, setTotalPrice] = useState(initialTotalPrice);
  const [updatingPrice, setUpdatingPrice] = useState(true);
  
  const [personalInfo, setPersonalInfo] = useState({
    fullName: formData?.guestName || '',
    email: '',
    phone: '',
    address: '',
    city: '',
    country: '',
    zipCode: '',
    specialRequests: '',
    paymentMethod: 'credit_card',
    cardNumber: '',
    cardName: '',
    expiryDate: '',
    cvv: ''
  });

  // Fetch latest dynamic pricing when component mounts
  useEffect(() => {
    const fetchLatestPricing = async () => {
      if (!formData || !initialRoom) return;
      
      try {
        setUpdatingPrice(true);
        const response = await axios.get('http://localhost:8000/api/dynamic-pricing', {
          params: {
            check_in: formData.checkIn,
            check_out: formData.checkOut
          }
        });
        
        // Find the pricing for this room
        const roomPricing = response.data.find(item => item.room_id === initialRoom.id);
        
        if (roomPricing) {
          // Update room with latest pricing
          const updatedRoom = {
            ...initialRoom,
            currentPrice: roomPricing.price,
            priceFactors: roomPricing.price_factors
          };
          
          setRoom(updatedRoom);
          
          // Recalculate total price
          const updatedTotalPrice = updatedRoom.currentPrice * nights;
          setTotalPrice(updatedTotalPrice);
        }
      } catch (error) {
        console.error("Error fetching latest pricing:", error);
        // Fallback to initial values if there's an error
        setRoom(initialRoom);
        setTotalPrice(initialTotalPrice);
      } finally {
        setUpdatingPrice(false);
      }
    };
    
    fetchLatestPricing();
  }, [formData, initialRoom, nights, initialTotalPrice]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setPersonalInfo(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    
    try {
      // Create booking data with the latest pricing
      const bookingData = {
        room_id: room.id,
        guest_name: personalInfo.fullName,
        check_in: formData.checkIn,
        check_out: formData.checkOut,
        guests: parseInt(formData.guests),
        price_per_night: room.currentPrice,
        total_price: totalPrice,
        guest_details: {
          email: personalInfo.email,
          phone: personalInfo.phone,
          address: personalInfo.address,
          city: personalInfo.city,
          country: personalInfo.country,
          zip_code: personalInfo.zipCode,
          special_requests: personalInfo.specialRequests,
          payment_method: personalInfo.paymentMethod
        }
      };
      
      // Send booking data to backend
      const response = await axios.post('http://localhost:8000/api/bookings', bookingData);
      
      // Set booking ID and show success
      setBookingId(response.data.id);
      setBookingComplete(true);
      setLoading(false);
    } catch (error) {
      console.error("Error completing booking:", error);
      setError(error.response?.data?.detail || 'An error occurred while processing your booking');
      setLoading(false);
    }
  };

  // Function to get price difference display
  const getPriceDiffDisplay = (currentPrice, basePrice) => {
    const priceDiff = currentPrice - basePrice;
    if (priceDiff === 0) return null;
    
    return (
      <span className={`text-xs font-medium ${priceDiff > 0 ? 'text-red-600' : 'text-green-600'}`}>
        ({priceDiff > 0 ? '+' : '-'}₹{Math.abs(priceDiff)})
      </span>
    );
  };

  // If no room data is passed, redirect to home
  if (!room || !formData) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900">No booking information found</h2>
          <p className="mt-2 text-gray-600">Please select a room first</p>
          <button 
            onClick={() => navigate('/')}
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Return to Home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8 flex justify-between items-center">
          <h1 className="text-3xl font-bold text-gray-900">Complete Your Booking</h1>
          <button 
            onClick={() => navigate('/')}
            className="text-blue-600 hover:text-blue-800"
          >
            Return to Home
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        {bookingComplete ? (
          <div className="bg-white shadow-lg rounded-xl overflow-hidden">
            {/* Success Banner */}
            <div className="px-6 py-8 bg-gradient-to-r from-green-50 to-emerald-50 border-b border-gray-100">
              <div className="max-w-3xl mx-auto text-center">
                <div className="flex justify-center mb-4">
                  <div className="rounded-full bg-green-100 p-3">
                    <svg className="h-12 w-12 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                </div>
                <h2 className="text-3xl font-bold text-gray-900 mb-2">Booking Confirmed!</h2>
                <p className="text-lg text-gray-600">Your reservation at {room.type} has been successfully booked.</p>
                <p className="text-gray-500 mt-2">Booking Reference: <span className="font-medium text-gray-900">{bookingId}</span></p>
              </div>
            </div>

            {/* Main Content */}
            <div className="max-w-5xl mx-auto px-4 py-8">
              {/* Booking Timeline */}
              <div className="mb-12">
                <div className="relative">
                  <div className="absolute inset-0 flex items-center" aria-hidden="true">
                    <div className="w-full border-t-2 border-gray-200"></div>
                  </div>
                  <div className="relative flex justify-between">
                    <div className="text-center">
                      <div className="relative flex items-center justify-center">
                        <span className="h-12 w-12 rounded-full bg-blue-100 flex items-center justify-center ring-8 ring-white">
                          <svg className="h-6 w-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                        </span>
                      </div>
                      <div className="mt-3">
                        <span className="text-sm font-medium text-gray-900">Check-in</span>
                        <p className="text-sm text-gray-500">{format(new Date(formData.checkIn), 'EEE, MMM d')}</p>
                        <p className="text-sm text-gray-500">From 2:00 PM</p>
                      </div>
                    </div>
                    
                    <div className="text-center">
                      <div className="relative flex items-center justify-center">
                        <span className="h-12 w-12 rounded-full bg-blue-100 flex items-center justify-center ring-8 ring-white">
                          <svg className="h-6 w-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                          </svg>
                        </span>
                      </div>
                      <div className="mt-3">
                        <span className="text-sm font-medium text-gray-900">Your Stay</span>
                        <p className="text-sm text-gray-500">{nights} Night{nights !== 1 ? 's' : ''}</p>
                        <p className="text-sm text-gray-500">{formData.guests} Guest{formData.guests !== 1 ? 's' : ''}</p>
                      </div>
                    </div>
                    
                    <div className="text-center">
                      <div className="relative flex items-center justify-center">
                        <span className="h-12 w-12 rounded-full bg-blue-100 flex items-center justify-center ring-8 ring-white">
                          <svg className="h-6 w-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                          </svg>
                        </span>
                      </div>
                      <div className="mt-3">
                        <span className="text-sm font-medium text-gray-900">Check-out</span>
                        <p className="text-sm text-gray-500">{format(new Date(formData.checkOut), 'EEE, MMM d')}</p>
                        <p className="text-sm text-gray-500">Until 11:00 AM</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Booking Details Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Room Details */}
                <div className="bg-gray-50 rounded-xl p-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                    <svg className="h-5 w-5 mr-2 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                    </svg>
                    Room Details
                  </h3>
                  <div className="flex items-start">
                    <img 
                      src={room.image_url} 
                      alt={room.type}
                      className="w-24 h-24 object-cover rounded-lg"
                    />
                    <div className="ml-4">
                      <h4 className="font-medium text-gray-900">{room.type}</h4>
                      <p className="text-gray-500 text-sm mt-1">₹{totalPrice}</p>
                      <div className="mt-2 flex items-center text-sm text-gray-500">
                        <svg className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                        </svg>
                        {formData.guests} Guest{formData.guests !== 1 ? 's' : ''}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Guest Details */}
                <div className="bg-gray-50 rounded-xl p-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                    <svg className="h-5 w-5 mr-2 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                    Guest Information
                  </h3>
                  <div className="space-y-3">
                    <div className="flex items-center text-sm">
                      <svg className="h-4 w-4 mr-2 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 12a4 4 0 10-8 0 4 4 0 008 0zm0 0v1.5a2.5 2.5 0 005 0V12a9 9 0 10-9 9m4.5-1.206a8.959 8.959 0 01-4.5 1.207" />
                      </svg>
                      <span className="text-gray-500">{personalInfo.email}</span>
                    </div>
                    <div className="flex items-center text-sm">
                      <svg className="h-4 w-4 mr-2 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                      </svg>
                      <span className="text-gray-500">{personalInfo.phone}</span>
                    </div>
                    <div className="flex items-start text-sm">
                      <svg className="h-4 w-4 mr-2 text-gray-400 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                      <span className="text-gray-500">
                        {personalInfo.address}, {personalInfo.city}, {personalInfo.country} {personalInfo.zipCode}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Payment Details */}
                <div className="bg-gray-50 rounded-xl p-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                    <svg className="h-5 w-5 mr-2 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                    </svg>
                    Payment Details
                  </h3>
                  <div className="space-y-3">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Payment Method</span>
                      <span className="font-medium text-gray-900">
                        {personalInfo.paymentMethod === 'credit_card' ? 'Credit Card' : 
                         personalInfo.paymentMethod === 'paypal' ? 'PayPal' : 'Bank Transfer'}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Total Amount</span>
                      <span className="font-medium text-gray-900">₹{totalPrice}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Status</span>
                      <span className="text-green-600 font-medium">Paid</span>
                    </div>
                  </div>
                </div>

                {/* Important Information */}
                <div className="bg-gray-50 rounded-xl p-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                    <svg className="h-5 w-5 mr-2 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Important Information
                  </h3>
                  <ul className="space-y-3">
                    <li className="flex items-start text-sm">
                      <svg className="h-5 w-5 mr-2 text-blue-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <span className="text-gray-600">Check-in time starts at 2:00 PM</span>
                    </li>
                    <li className="flex items-start text-sm">
                      <svg className="h-5 w-5 mr-2 text-blue-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <span className="text-gray-600">Check-out time is 11:00 AM</span>
                    </li>
                    <li className="flex items-start text-sm">
                      <svg className="h-5 w-5 mr-2 text-blue-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <span className="text-gray-600">Please present ID and credit card at check-in</span>
                    </li>
                    <li className="flex items-start text-sm">
                      <svg className="h-5 w-5 mr-2 text-blue-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <span className="text-gray-600">Booking confirmation sent to your email</span>
                    </li>
                  </ul>
                </div>
              </div>

              {/* Actions */}
              <div className="mt-8 flex justify-center space-x-4">
                <button
                  onClick={() => window.print()}
                  className="inline-flex items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                >
                  <svg className="h-5 w-5 mr-2 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                  </svg>
                  Print Booking
                </button>
                <button
                  onClick={() => navigate('/')}
                  className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                >
                  <svg className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                  </svg>
                  Return to Home
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            {/* Booking Summary */}
            <div className="lg:col-span-1">
              <div className="bg-white shadow overflow-hidden sm:rounded-lg sticky top-6">
                <div className="px-4 py-5 sm:px-6 bg-gray-50">
                  <h3 className="text-lg leading-6 font-medium text-gray-900">Booking Summary</h3>
                </div>
                <div className="border-t border-gray-200 px-4 py-5 sm:p-6">
                  <div className="flex items-center mb-4">
                    <img 
                      src={room.image_url} 
                      alt={room.type} 
                      className="h-20 w-20 object-cover rounded-md"
                    />
                    <div className="ml-4">
                      <h4 className="text-lg font-medium text-gray-900">{room.type}</h4>
                      <p className="text-sm text-gray-500">
                        {updatingPrice ? (
                          <span className="inline-flex items-center">
                            <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            Updating price...
                          </span>
                        ) : (
                          <>
                            <span className="text-gray-500 line-through text-xs">₹{room.basePrice}</span>{' '}
                            <span className="text-blue-600 font-medium">₹{room.currentPrice}</span>{' '}
                            {getPriceDiffDisplay(room.currentPrice, room.basePrice)}
                          </>
                        )}
                      </p>
                    </div>
                  </div>
                  
                  <dl className="mt-4 space-y-3 text-sm">
                    <div className="flex justify-between">
                      <dt className="text-gray-600">Check-in</dt>
                      <dd className="font-medium text-gray-900">{format(new Date(formData.checkIn), 'MMM d, yyyy')}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-gray-600">Check-out</dt>
                      <dd className="font-medium text-gray-900">{format(new Date(formData.checkOut), 'MMM d, yyyy')}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-gray-600">Guests</dt>
                      <dd className="font-medium text-gray-900">{formData.guests}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-gray-600">Length of stay</dt>
                      <dd className="font-medium text-gray-900">{nights} night{nights !== 1 ? 's' : ''}</dd>
                    </div>
                    
                    <div className="pt-3 border-t border-gray-200">
                      <div className="flex justify-between">
                        <dt className="text-gray-600">₹{room.currentPrice} × {nights} night{nights !== 1 ? 's' : ''}</dt>
                        <dd className="font-medium text-gray-900">₹{room.currentPrice * nights}</dd>
                      </div>
                      <div className="flex justify-between mt-2">
                        <dt className="font-medium text-gray-900">Total</dt>
                        <dd className="font-medium text-gray-900">
                          {updatingPrice ? (
                            <span className="inline-flex items-center">
                              <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                              </svg>
                              Updating...
                            </span>
                          ) : (
                            <>₹{totalPrice}</>
                          )}
                        </dd>
                      </div>
                    </div>
                  </dl>
                </div>
              </div>
            </div>
            
            {/* Guest Information Form */}
            <div className="lg:col-span-2">
              <form onSubmit={handleSubmit} className="bg-white shadow-lg rounded-xl overflow-hidden transition-all duration-300 hover:shadow-xl">
                <div className="px-6 py-6 bg-gradient-to-r from-blue-50 to-indigo-50">
                  <h3 className="text-xl font-semibold text-gray-900">Guest Information</h3>
                  <p className="mt-2 text-sm text-gray-600">Please provide your details to complete the booking.</p>
                </div>
                
                {error && (
                  <div className="mx-6 mt-4 px-4 py-3 bg-red-50 border-l-4 border-red-400 text-red-700 rounded-md">
                    <p>{error}</p>
                  </div>
                )}
                
                <div className="px-6 py-6 space-y-6">
                  <div className="grid grid-cols-6 gap-6">
                    <div className="col-span-6">
                      <label htmlFor="fullName" className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
                      <input
                        type="text"
                        name="fullName"
                        id="fullName"
                        value={personalInfo.fullName}
                        onChange={handleInputChange}
                        required
                        className="block w-full px-4 py-3 rounded-lg border border-gray-300 shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent transition duration-150 ease-in-out"
                        placeholder="Enter your full name"
                      />
                    </div>
                    
                    <div className="col-span-6 sm:col-span-3">
                      <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">Email Address</label>
                      <input
                        type="email"
                        name="email"
                        id="email"
                        value={personalInfo.email}
                        onChange={handleInputChange}
                        required
                        className="block w-full px-4 py-3 rounded-lg border border-gray-300 shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent transition duration-150 ease-in-out"
                        placeholder="your.email@example.com"
                      />
                    </div>
                    
                    <div className="col-span-6 sm:col-span-3">
                      <label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-1">Phone Number</label>
                      <input
                        type="tel"
                        name="phone"
                        id="phone"
                        value={personalInfo.phone}
                        onChange={handleInputChange}
                        required
                        className="block w-full px-4 py-3 rounded-lg border border-gray-300 shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent transition duration-150 ease-in-out"
                        placeholder="+1 (555) 000-0000"
                      />
                    </div>
                    
                    <div className="col-span-6">
                      <label htmlFor="address" className="block text-sm font-medium text-gray-700 mb-1">Address</label>
                      <input
                        type="text"
                        name="address"
                        id="address"
                        value={personalInfo.address}
                        onChange={handleInputChange}
                        required
                        className="block w-full px-4 py-3 rounded-lg border border-gray-300 shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent transition duration-150 ease-in-out"
                        placeholder="Enter your street address"
                      />
                    </div>
                    
                    <div className="col-span-6 sm:col-span-2">
                      <label htmlFor="city" className="block text-sm font-medium text-gray-700 mb-1">City</label>
                      <input
                        type="text"
                        name="city"
                        id="city"
                        value={personalInfo.city}
                        onChange={handleInputChange}
                        required
                        className="block w-full px-4 py-3 rounded-lg border border-gray-300 shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent transition duration-150 ease-in-out"
                        placeholder="Enter city"
                      />
                    </div>
                    
                    <div className="col-span-6 sm:col-span-2">
                      <label htmlFor="country" className="block text-sm font-medium text-gray-700 mb-1">Country</label>
                      <input
                        type="text"
                        name="country"
                        id="country"
                        value={personalInfo.country}
                        onChange={handleInputChange}
                        required
                        className="block w-full px-4 py-3 rounded-lg border border-gray-300 shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent transition duration-150 ease-in-out"
                        placeholder="Enter country"
                      />
                    </div>
                    
                    <div className="col-span-6 sm:col-span-2">
                      <label htmlFor="zipCode" className="block text-sm font-medium text-gray-700 mb-1">ZIP / Postal Code</label>
                      <input
                        type="text"
                        name="zipCode"
                        id="zipCode"
                        value={personalInfo.zipCode}
                        onChange={handleInputChange}
                        required
                        className="block w-full px-4 py-3 rounded-lg border border-gray-300 shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent transition duration-150 ease-in-out"
                        placeholder="Enter ZIP code"
                      />
                    </div>
                    
                    <div className="col-span-6">
                      <label htmlFor="specialRequests" className="block text-sm font-medium text-gray-700 mb-1">Special Requests</label>
                      <textarea
                        name="specialRequests"
                        id="specialRequests"
                        rows="4"
                        value={personalInfo.specialRequests}
                        onChange={handleInputChange}
                        className="block w-full px-4 py-3 rounded-lg border border-gray-300 shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent transition duration-150 ease-in-out resize-none"
                        placeholder="Let us know if you have any special requests..."
                      ></textarea>
                      <p className="mt-2 text-sm text-gray-500 italic">We'll do our best to accommodate your requests, but they cannot be guaranteed.</p>
                    </div>
                  </div>
                </div>

                <div className="px-6 py-6 bg-gradient-to-r from-blue-50 to-indigo-50">
                  <h3 className="text-xl font-semibold text-gray-900">Payment Information</h3>
                </div>
                
                <div className="px-6 py-6 space-y-6">
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-3">Payment Method</label>
                      <div className="grid grid-cols-3 gap-4">
                        <div className="relative">
                          <input
                            id="credit_card"
                            name="paymentMethod"
                            type="radio"
                            value="credit_card"
                            checked={personalInfo.paymentMethod === 'credit_card'}
                            onChange={handleInputChange}
                            className="sr-only"
                          />
                          <label
                            htmlFor="credit_card"
                            className={`flex flex-col items-center justify-center p-4 rounded-lg border-2 cursor-pointer transition-all duration-200 ${
                              personalInfo.paymentMethod === 'credit_card'
                                ? 'border-blue-500 bg-blue-50'
                                : 'border-gray-200 hover:border-blue-200'
                            }`}
                          >
                            <svg className="w-8 h-8 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                            </svg>
                            <span className="text-sm font-medium">Credit Card</span>
                          </label>
                        </div>

                        <div className="relative">
                          <input
                            id="paypal"
                            name="paymentMethod"
                            type="radio"
                            value="paypal"
                            checked={personalInfo.paymentMethod === 'paypal'}
                            onChange={handleInputChange}
                            className="sr-only"
                          />
                          <label
                            htmlFor="paypal"
                            className={`flex flex-col items-center justify-center p-4 rounded-lg border-2 cursor-pointer transition-all duration-200 ${
                              personalInfo.paymentMethod === 'paypal'
                                ? 'border-blue-500 bg-blue-50'
                                : 'border-gray-200 hover:border-blue-200'
                            }`}
                          >
                            <svg className="w-8 h-8 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
                            </svg>
                            <span className="text-sm font-medium">PayPal</span>
                          </label>
                        </div>

                        <div className="relative">
                          <input
                            id="bank_transfer"
                            name="paymentMethod"
                            type="radio"
                            value="bank_transfer"
                            checked={personalInfo.paymentMethod === 'bank_transfer'}
                            onChange={handleInputChange}
                            className="sr-only"
                          />
                          <label
                            htmlFor="bank_transfer"
                            className={`flex flex-col items-center justify-center p-4 rounded-lg border-2 cursor-pointer transition-all duration-200 ${
                              personalInfo.paymentMethod === 'bank_transfer'
                                ? 'border-blue-500 bg-blue-50'
                                : 'border-gray-200 hover:border-blue-200'
                            }`}
                          >
                            <svg className="w-8 h-8 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3" />
                            </svg>
                            <span className="text-sm font-medium">Bank Transfer</span>
                          </label>
                        </div>
                      </div>
                    </div>
                    
                    {personalInfo.paymentMethod === 'credit_card' && (
                      <div className="grid grid-cols-6 gap-6 mt-6 p-6 bg-gray-50 rounded-lg">
                        <div className="col-span-6">
                          <label htmlFor="cardNumber" className="block text-sm font-medium text-gray-700 mb-1">Card Number</label>
                          <input
                            type="text"
                            name="cardNumber"
                            id="cardNumber"
                            placeholder="1234 5678 9012 3456"
                            value={personalInfo.cardNumber}
                            onChange={handleInputChange}
                            required
                            className="block w-full px-4 py-3 rounded-lg border border-gray-300 shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent transition duration-150 ease-in-out"
                          />
                        </div>
                        
                        <div className="col-span-6">
                          <label htmlFor="cardName" className="block text-sm font-medium text-gray-700 mb-1">Name on Card</label>
                          <input
                            type="text"
                            name="cardName"
                            id="cardName"
                            value={personalInfo.cardName}
                            onChange={handleInputChange}
                            required
                            className="block w-full px-4 py-3 rounded-lg border border-gray-300 shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent transition duration-150 ease-in-out"
                            placeholder="Enter name as shown on card"
                          />
                        </div>
                        
                        <div className="col-span-3">
                          <label htmlFor="expiryDate" className="block text-sm font-medium text-gray-700 mb-1">Expiry Date</label>
                          <input
                            type="text"
                            name="expiryDate"
                            id="expiryDate"
                            placeholder="MM/YY"
                            value={personalInfo.expiryDate}
                            onChange={handleInputChange}
                            required
                            className="block w-full px-4 py-3 rounded-lg border border-gray-300 shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent transition duration-150 ease-in-out"
                          />
                        </div>
                        
                        <div className="col-span-3">
                          <label htmlFor="cvv" className="block text-sm font-medium text-gray-700 mb-1">CVV</label>
                          <input
                            type="text"
                            name="cvv"
                            id="cvv"
                            placeholder="123"
                            value={personalInfo.cvv}
                            onChange={handleInputChange}
                            required
                            className="block w-full px-4 py-3 rounded-lg border border-gray-300 shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent transition duration-150 ease-in-out"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                
                <div className="px-6 py-6 bg-gradient-to-r from-blue-50 to-indigo-50 flex items-center justify-between">
                  <p className="text-sm text-gray-600">All transactions are secure and encrypted</p>
                  <button
                    type="submit"
                    disabled={loading || updatingPrice}
                    className="inline-flex items-center px-6 py-3 border border-transparent text-base font-medium rounded-lg shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-blue-300 disabled:cursor-not-allowed transition-colors duration-200"
                  >
                    {loading ? (
                      <>
                        <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Processing...
                      </>
                    ) : updatingPrice ? (
                      <>
                        <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Updating Prices...
                      </>
                    ) : (
                      'Complete Booking'
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default BookingConfirmation; 
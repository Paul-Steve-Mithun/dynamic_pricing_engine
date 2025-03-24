import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import HotelManagementSystem from './HotelManagementSystem';
import BookingConfirmation from './BookingConfirmation';
import './App.css';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<HotelManagementSystem />} />
        <Route path="/booking-confirmation" element={<BookingConfirmation />} />
      </Routes>
    </Router>
  );
}

export default App;
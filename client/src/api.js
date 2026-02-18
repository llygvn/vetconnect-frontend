// src/api.js
import axios from "axios";

// Base URL for your backend
const API = axios.create({
  baseURL: "http://localhost:5000", // your Express server
  headers: {
    "Content-Type": "application/json",
  },
});

// Optional: Add an interceptor to include JWT automatically
API.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export default API;

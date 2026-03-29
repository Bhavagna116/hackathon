const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const mongoose = require("mongoose");
const cors = require("cors");
const dns = require("dns");

// Force Node.js to prioritize IPv4 DNS results to bypass restrictive local Wi-Fi providers dropping IPv6 SRV queries
dns.setDefaultResultOrder('ipv4first');

const app = express();
app.use(cors());

const server = http.createServer(app);

// We explicitly bypass SRV (mongodb+srv) by formulating the direct standard connection string
// This guarantees Node.js skips the extremely buggy Windows DNS SRV polling mechanism
const MONGO_URI = "mongodb://aravindkumar23567_db_user:ydRKwgtEaoVsJ8Wh@ac-zogpmy1-shard-00-00.murxn24.mongodb.net:27017,ac-zogpmy1-shard-00-01.murxn24.mongodb.net:27017,ac-zogpmy1-shard-00-02.murxn24.mongodb.net:27017/election_patrol?ssl=true&replicaSet=atlas-cow1gf-shard-0&authSource=admin&retryWrites=true&w=majority&appName=Cluster0";

mongoose.connect(MONGO_URI)
  .then(() => console.log("Connected to MongoDB via Mongoose"))
  .catch(err => console.error("MongoDB connection error:", err));

// Define schema matching the new localized tracking collection
// strict: false allows Mongoose to update specific fields without wiping other schema data
const officerSchema = new mongoose.Schema({
  unique_id: { type: String, unique: true },
  last_latitude: Number,
  last_longitude: Number,
  availability_status: String,
  last_updated: Date,
}, { strict: false });

// Target strictly the tracking collection managed by NodeJS!
const Officer = mongoose.model("Officer", officerSchema, "officer_tracking");

const io = new Server(server, {
  cors: { origin: "*" },
});

io.on("connection", (socket) => {
  console.log("User connected to socket:", socket.id);

  socket.on("sendLocation", async (data) => {
    // Expected incoming data: userId (which is unique_id), latitude, longitude, availability_status, timestamp
    console.log("Receiving sendLocation trace:", data.userId, data.latitude, data.longitude, data.availability_status);
    try {
      const broadcastPayload = {
        unique_id: data.userId,
        latitude: data.latitude,
        longitude: data.longitude,
        availability_status: data.availability_status || "free",
        timestamp: data.timestamp || new Date().toISOString()
      };
      // Emit immediately for sub-millisecond reaction time on the Dashboard
      io.emit("locationUpdate", broadcastPayload);

      // Save to database in async background
      await Officer.findOneAndUpdate(
        { unique_id: data.userId }, 
        {
          last_latitude: data.latitude,
          last_longitude: data.longitude,
          availability_status: data.availability_status || "free",
          last_updated: new Date(data.timestamp || Date.now()),
        },
        { upsert: true }
      );
    } catch (err) {
      console.error("Error updating location:", err);
    }
  });

  socket.on("updateStatus", async (data) => {
    // Expected data: userId, status
    try {
      await Officer.findOneAndUpdate(
        { unique_id: data.userId },
        { 
          availability_status: data.status,
          last_updated: new Date()
        },
        { upsert: true }
      );
    } catch (err) {
      console.error("Error updating status via socket:", err);
    }
  });

  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);
  });
});

server.listen(3000, "0.0.0.0", () => {
  console.log("Node.js Socket.io Server running on port 3000 (0.0.0.0)");
});

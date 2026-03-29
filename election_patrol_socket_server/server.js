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

app.use(express.json());

// INTERNAL ENDPOINT: Allow Python backend to trigger socket dispatches
app.post("/dispatch-alert", (req, res) => {
  const { targetUserId, incident } = req.body;
  if (!targetUserId || !incident) {
    return res.status(400).json({ error: "Missing targetUserId or incident" });
  }
  console.log(`[HTTP Dispatch] Alerting user ${targetUserId}`);
  io.to(targetUserId).emit("incidentAlert", incident);
  res.json({ status: "success" });
});

const LOCAL_MONGO_URI = "mongodb://aravindkumar23567_db_user:ydRKwgtEaoVsJ8Wh@ac-zogpmy1-shard-00-00.murxn24.mongodb.net:27017,ac-zogpmy1-shard-00-01.murxn24.mongodb.net:27017,ac-zogpmy1-shard-00-02.murxn24.mongodb.net:27017/election_patrol?ssl=true&replicaSet=atlas-cow1gf-shard-0&authSource=admin&retryWrites=true&w=majority&appName=Cluster0";
const MONGO_URI = process.env.MONGODB_URI || LOCAL_MONGO_URI;

mongoose.connect(MONGO_URI)
  .then(() => console.log("Connected to MongoDB via Mongoose"))
  .catch(err => console.error("MongoDB connection error:", err));

const officerSchema = new mongoose.Schema({
  unique_id: { type: String, unique: true },
  last_latitude: Number,
  last_longitude: Number,
  availability_status: String,
  last_updated: Date,
}, { strict: false });

const Officer = mongoose.model("Officer", officerSchema, "officer_tracking");

const io = new Server(server, {
  cors: { origin: "*" },
});

io.on("connection", (socket) => {
  console.log("User connected to socket:", socket.id);

  socket.on("join", (userId) => {
    socket.join(userId);
    console.log(`User ${userId} joined their private room: ${userId}`);
  });

  socket.on("sendLocation", async (data) => {
    console.log("Receiving sendLocation trace:", data.userId, data.latitude, data.longitude, data.availability_status);
    socket.join(data.userId); 
    try {
      const broadcastPayload = {
        unique_id: data.userId,
        latitude: data.latitude,
        longitude: data.longitude,
        availability_status: data.availability_status || "free",
        timestamp: data.timestamp || new Date().toISOString()
      };
      io.emit("locationUpdate", broadcastPayload);

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

  socket.on("dispatchAlert", (data) => {
    console.log(`Dispatching real-time alert to user ${data.targetUserId}`);
    io.to(data.targetUserId).emit("incidentAlert", data.incident);
  });

  socket.on("updateStatus", async (data) => {
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

const PORT = process.env.PORT || 3000;
server.listen(PORT, "0.0.0.0", () => {
  console.log(`Node.js Socket.io Server running on port ${PORT} (0.0.0.0)`);
});

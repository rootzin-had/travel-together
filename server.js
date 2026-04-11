const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const SECRET = "travel_together_2026";

const app = express();
app.use(cors());
app.use(express.json());



// ===== DB CONNECTION =====
const db = mysql.createConnection({
  host: "localhost",
  user: "root",
  password: "1q2w3e4r",
  database: "travel_together"
});

db.connect(err => {
  if (err) throw err;
  console.log("MySQL Connected");
});

// ===== AUTH MIDDLEWARE =====
function getToken(req) {
  const authHeader = req.headers['authorization'];
  if (!authHeader) return null;

  return authHeader.split(' ')[1];
}

function verifyToken(req, res, next) {
  const authHeader = req.headers['authorization'];

  if (!authHeader) {
    return res.status(401).json({ msg: "No token" });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, SECRET);
    req.user = decoded;   // 🔥 THIS LINE IS KEY
    next();
  } catch (err) {
    return res.status(401).json({ msg: "Invalid token" });
  }
}

function verifyAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ msg: "Admin only" });
  }
  next();
}

// ===== AUTH ROUTES =====

// Register
const bcrypt = require('bcrypt');
app.post('/auth/register', async (req, res) => {
  const { name, email, password, role } = req.body;

  try {
    // hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // restrict roles
    const allowedRoles = ['user', 'coordinator'];
    const safeRole = allowedRoles.includes(role) ? role : 'user';

    db.query(
      "INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)",
      [name, email, hashedPassword, safeRole],
      (err) => {
        if (err) return res.status(400).json({ msg: "User exists" });
        res.json({ msg: "Registered" });
      }
    );

  } catch (err) {
    res.status(500).json({ msg: "Server error" });
  }
});

// Login
app.post('/auth/login', (req, res) => {
  const { email, password } = req.body;

  db.query(
    "SELECT * FROM users WHERE email = ?",
    [email],
    async (err, results) => {
      if (err) return res.status(500).json({ msg: "Server error" });

      if (results.length === 0) {
        return res.status(400).json({ msg: "User not found" });
      }

      const user = results[0];

      // compare password
      const match = await bcrypt.compare(password, user.password);

      if (!match) {
        return res.status(400).json({ msg: "Invalid password" });
      }

      const token = jwt.sign(
  { id: user.id, role: user.role },
  SECRET,
  { expiresIn: "1d" }
);

      res.json({
        msg: "Login successful",
        token,
        user: {
          id: user.id,
          name: user.name,
          role: user.role
        }
      });
    }
  );
});

// ===== PACKAGES =====

// Get all packages
app.get('/packages', verifyToken, (req, res) => {
  let sql;
  let params = [];

  if (req.user.role === 'admin') {
    // ✅ Admin → show all with coordinator name
    sql = `
      SELECT p.*, u.name AS coordinator_name
      FROM packages p
      JOIN users u ON p.coordinator_id = u.id
    `;
  } else {
    // ✅ Coordinator → only their packages
    sql = `
      SELECT p.*, u.name AS coordinator_name
      FROM packages p
      JOIN users u ON p.coordinator_id = u.id
      WHERE p.coordinator_id = ?
    `;
    params = [req.user.id];
  }

  db.query(sql, params, (err, result) => {
    if (err) {
      console.log(err);
      return res.status(500).json(err);
    }
    res.json(result);
  });
});

// Add package (coordinator)


app.post('/packages', verifyToken, (req, res) => {
  const { title, description, price } = req.body;

  const sql = `
    INSERT INTO packages (title, description, price, coordinator_id)
    VALUES (?, ?, ?, ?)
  `;

  db.query(sql, [title, description, price, req.user.id], (err, result) => {
    if (err) return res.status(500).json(err);
    res.json({ msg: "Package created" });
  });
});




//confirm booking 
app.get('/coordinator/bookings', verifyToken, (req, res) => {
  // allow only coordinator
  if (req.user.role !== 'coordinator') {
    return res.status(403).json({ msg: "Access denied" });
  }

  db.query(
    `SELECT b.*, p.title 
     FROM bookings b
     JOIN packages p ON b.package_id = p.id
     WHERE p.coordinator_id = ?`,
    [req.user.id],
    (err, results) => {
      if (err) return res.status(500).json({ msg: "Server error" });
      res.json(results);
    }
  );
});




// ===== BOOKINGS =====

// Create booking
app.post('/bookings', verifyToken, (req, res) => {
  const { package_id, persons, date } = req.body;

  if (!package_id || !persons || !date) {
    return res.status(400).json({ msg: "Missing fields" });
  }

  db.query(
    "INSERT INTO bookings (user_id, package_id, persons, status, booking_date) VALUES (?, ?, ?, 'Pending', ?)",
    [req.user.id, package_id, persons, date],
    (err) => {
      if (err) {
        return res.status(500).json({ msg: "Server error" });
      }
      res.json({ msg: "Booked" });
    }
  );
});

// Get bookings
app.get('/bookings', verifyToken, (req, res) => {
  let sql;
  let params = [];

  if (req.user.role === 'admin') {
    sql = `
      SELECT bookings.*, users.name
      FROM bookings
      JOIN users ON bookings.user_id = users.id
    `;
  } else if (req.user.role === 'coordinator') {
    sql = `
      SELECT b.*, u.name
      FROM bookings b
      JOIN packages p ON b.package_id = p.id
      JOIN users u ON b.user_id = u.id
      WHERE p.coordinator_id = ?
    `;
    params = [req.user.id];
  } else {
    sql = "SELECT * FROM bookings WHERE user_id = ?";
    params = [req.user.id];
  }

  db.query(sql, params, (err, result) => {
    if (err) return res.status(500).json(err);
    res.json(result);
  });
});

app.put('/bookings/:id/status', verifyToken, (req, res) => {
  const bookingId = req.params.id;
  const { status } = req.body;

  if (req.user.role !== 'coordinator') {
    return res.status(403).json({ msg: "Access denied" });
  }

  db.query(
    `UPDATE bookings b
     JOIN packages p ON b.package_id = p.id
     SET b.status = ?
     WHERE b.id = ? AND p.coordinator_id = ?`,
    [status, bookingId, req.user.id],
    (err, result) => {
      if (err) return res.status(500).json({ msg: "Server error" });

      if (result.affectedRows === 0) {
        return res.status(400).json({ msg: "Not allowed or not found" });
      }

      res.json({ msg: "Updated" });
    }
  );
});


// ===== SAVED (WISHLIST) =====

// Get saved
app.get('/saved', verifyToken, (req, res) => {
  db.query(
    "SELECT * FROM saved_packages WHERE user_id=?",
    [req.user.id],
    (err, results) => res.json(results)
  );
});

// Save package
app.post('/saved', verifyToken, (req, res) => {
  const { package_id } = req.body;

  db.query(
    "INSERT INTO saved_packages (user_id, package_id) VALUES (?, ?)",
    [req.user.id, package_id],
    () => res.json({ msg: "Saved" })
  );
});

// Remove saved
app.delete('/packages/:id', verifyToken, (req, res) => {
  const id = req.params.id;
  const userId = req.user.id;

  db.query(
    "DELETE FROM packages WHERE id = ? AND coordinator_id = ?",
    [id,userId],
    (err, result) => {
      if (err) {
        console.log("DB ERROR:", err);
        return res.status(500).json({ msg: "Server error" });
      }

      if (result.affectedRows === 0) {
        return res.status(400).json({ msg: "Not found" });
      }

      res.json({ msg: "Deleted" });
    }
  );
});

// ===== ADMIN =====

app.get('/admin/coordinators', verifyToken, verifyAdmin, (req, res) => {
  const sql = `
    SELECT id, name, email
    FROM users
    WHERE role = 'coordinator'
  `;

  db.query(sql, (err, result) => {
    if (err) return res.status(500).json(err);
    res.json(result);
  });
});




// Delete coordinator
app.delete('/admin/delete-coordinator/:id', verifyToken, verifyAdmin, (req, res) => {
  const id = req.params.id;

  db.query("DELETE FROM users WHERE id=? AND role='coordinator'", [id], () => {
    res.json({ msg: "Coordinator deleted" });
  });
});

// ===== SERVER =====
app.listen(3000, () => {
  console.log("Server running on http://localhost:3000");
});
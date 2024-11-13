const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors'); // Import the cors middleware
const db = require('./database'); // Assuming you have a database setup
const Razorpay = require('razorpay');
const path = require('path'); // For serving static files
require('dotenv').config(); // Load environment variables
const crypto = require('crypto');

const { body, validationResult } = require('express-validator');


const app = express();
const port = 3000;

// Enable CORS for all routes
app.use(cors());

// Middleware to parse JSON and URL-encoded data
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// Razorpay instance configuration (ensure you have environment variables in your .env file)
const razorpay = new Razorpay({
    key_id: 'rzp_test_xUzWg33hsBbdcw', // Your Razorpay key_id
    key_secret: '3oXK5ZkPyP4pKyOD7TdVQvMd', // Your Razorpay key_secret
});

// Serve static files (home.html)
app.use(express.static(path.join(__dirname, 'public')));

// Route to handle login
app.post('/login', (req, res) => {
    const { phone, password } = req.body;

    // Check if the customer exists with the given phone number
    const query = `SELECT * FROM customers WHERE phone = ?`;
    db.get(query, [phone], (err, row) => {
        if (err) {
            console.error(err);
            return res.status(500).send('Internal server error.');
        }

        // If customer does not exist or password is invalid, send a generic warning
        if (!row || row.password !== password) {
            return res.status(400).json({ message: 'Invalid phone number or password.' });
        }

        // Login successful
        res.redirect('http://127.0.0.1:5501/Consumer/home.html');
    });
});

// Route to add customer data to the database
app.post('/add-customer', [
    body('name').notEmpty().withMessage('Name is required'),
    body('email').isEmail().withMessage('Valid email is required'),
    body('phone').notEmpty().withMessage('Phone number is required'),
    body('password').notEmpty().withMessage('Password is required'),
], (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ message: errors.array().map(err => err.msg).join(', ') });
    }

    const { name, email, phone, password, address, city, postalCode } = req.body;

    // Check if the customer already exists
    const checkQuery = `SELECT * FROM customers WHERE email = ? OR phone = ?`;
    db.get(checkQuery, [email, phone], (err, row) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ message: 'Error checking for existing customer.' });
        }

        // If customer exists, send a response
        if (row) {
            return res.status(400).json({ message: 'Customer already exists with this email or phone number.' });
        }

        // Insert the new customer if not exists
        const query = `INSERT INTO customers (name, email, phone, password, address, city, postalCode) 
                       VALUES (?, ?, ?, ?, ?, ?, ?)`;
        db.run(query, [name, email, phone, password, address, city, postalCode], function (err) {
            if (err) {
                console.error(err);
                return res.status(500).json({ message: 'Error saving customer data.' });
            }
            // Redirect to login.html from the server side
            res.status(200).json({ message: 'Customer added successfully!'});
        });
    });
});

// Route to add customer data to the database
app.post('/add-train', [
    body('trainName').notEmpty().withMessage('Name is required'),
    body('trainNumber').isInt().withMessage('Valid Number is required'),
    body('trainNumber').isLength({ min: 5, max: 5 }).withMessage('Valid Number is required'),
    body('source').notEmpty().withMessage('Source is required'),
    body('destination').notEmpty().withMessage('Destination is required'),
    body('email').isEmail().withMessage('Valid email is required'),
], (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ message: errors.array().map(err => err.msg).join(', ') });
    }

    const { trainName, trainNumber, source, destination,fare_AC, availability_AC, fare_nonAC, availability_nonAC, email, password } = req.body;

    // Check if the customer already exists
    const checkQuery = `SELECT * FROM trains WHERE trainName = ? OR trainNumber = ?`;
    db.get(checkQuery, [trainName, trainNumber ], (err, row) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ message: 'Error checking for existing customer.' });
        }

        // If customer exists, send a response
        if (row) {
            return res.status(400).json({ message: 'Train already exists with this name or number.' });
        }

        if(email !== 'admin@gmail.com' || password !== 'admin@123') {
            return res.status(400).json({ message: 'Invalid email or password.' });
        }

        // Insert the new customer if not exists
        const query = `INSERT INTO trains (trainName, trainNumber, source, destination, fare_AC, availability_AC, fare_nonAC, availability_nonAC) 
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
        db.run(query, [trainName, trainNumber, source, destination, fare_AC, availability_AC, fare_nonAC, availability_nonAC], function (err) {
            if (err) {
                console.error(err);
                return res.status(500).json({ message: 'Error saving new train data.' });
            }
            // Redirect to login.html from the server side
            res.status(200).json({ message: 'Train added successfully!'});
        });
    });
});

// Route to get train data to the database
app.post('/get-trains', [
], (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ message: errors.array().map(err => err.msg).join(', ') });
    }

    const { trainName, trainNumber, source, destination } = req.body;

    // Check if the train exists
    const checkQuery = `SELECT * FROM trains WHERE trainName = ? OR trainNumber = ? OR (source = ? AND destination = ?)`;
    db.all(checkQuery, [trainName, trainNumber, source, destination], (err, rows) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ message: 'Error checking for existing train.' });
        }

        // If the train exists, send the existing train data
        if (rows.length>0) {
            return res.status(200).json({ message: 'Train found', trains: rows });
        }

        // If no train found, send a message
        res.status(404).json({ message: 'Train not found for the given details.' });
    });
});


app.post('/book-train', (req, res) => {
    const {ticketID,trainNumber,passengerName,passengerAge,seatType,passengerCount,status} = req.body;
    // Use the correct column names as per the table schema
    const availabilityField = seatType === "AC" ? "availability_AC" : "availability_nonAC";

    const updateQuery = `UPDATE trains SET ${availabilityField} = ${availabilityField} - ? 
                         WHERE trainNumber = ?`;

    db.run(updateQuery, [passengerCount, trainNumber], function (err) {
        if (err) {
            console.error('Error during database update:', err.message);  // Log detailed error
            return res.status(500).json({ success: false, message: 'Failed to update availability.' });
        }

        // if (this.changes === 0) {
        //     // No rows were updated, likely due to insufficient availability
        //     return res.status(400).json({ success: false, message: 'Insufficient availability for booking.' });
        // }

        res.json({ success: true, message: 'Booking confirmed!' });
    });
    
    const insertQuery='INSERT INTO tickets values(?,?,?,?,?,?,?)';

    db.run(insertQuery, [ticketID,passengerName,passengerAge,trainNumber,passengerCount,seatType,status],function(err){
        if (err){
            console.error('Error during database insert:', err.message);  // Log detailed error
            return res.status(500).json({ success: false, message: 'Failed to Insert Tickets Details.' });
        }
    })
});


app.get('/get-train/:trainNumber', (req, res) => {
    const trainNumber = req.params.trainNumber;
    const query = `SELECT * FROM trains WHERE trainNumber = ?`;
    db.get(query, [trainNumber], (err, row) => {
        if (err) {
            return res.status(500).json({ error: 'Error fetching train details.' });
        }
        if (row) {
            return res.json(row);  // Send the row as JSON if train found
        } else {
            return res.status(404).json({ error: 'Train not found.' });
        }
    });
});

app.post('/get-ticket', (req, res) => {
    const { ticketID } = req.body; 
    const query = `SELECT * FROM tickets,trains WHERE tickets.trainNumber=trains.trainNumber and ticketID = ?`;
    db.get(query, [ticketID], (err, row) => {
        if (err) {
            return res.status(500).json({ error: 'Error fetching Ticket details.' });
        }
        if (row) {
            return res.json({ success: true, ticket: row });
        } else {
            return res.status(404).json({ success: false, error: 'Ticket not found.' });
        }
    });
});

app.post('/cancel-ticket', (req, res) => {
    const { ticketID } = req.body; 
    const query = `SELECT * FROM tickets,trains WHERE tickets.trainNumber=trains.trainNumber and ticketID = ?`;
    db.get(query, [ticketID], (err, row) => {
        if (err) {
            return res.status(500).json({ error: 'Error fetching Ticket details.' });
        }
        if (row) {
            const uQuery='UPDATE trains set ? = ? where trainNumber= ? ';
            const delQuery='delete from tickets where ticketID= ? ';
            return res.json({ success: true, ticket: row });
        } else {
            return res.status(404).json({ success: false, error: 'Ticket not found.' });
        }
    });
});

// Route for /customers
app.get('/customers', (req, res) => {
    db.all('SELECT * FROM customers', (err, rows) => {
        if (err) {
            return res.status(500).send('Error retrieving data');
        }
        res.json(rows); 
    });
});

// Route for trains
app.get('/trains', (req, res) => {
    db.all('SELECT * FROM trains', (err, rows) => {
        if (err) {
            return res.status(500).send('Error retrieving data');
        }
        res.json(rows);
    });
});

// Start the server
app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
});

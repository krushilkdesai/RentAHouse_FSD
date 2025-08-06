var express = require("express");
var router = express.Router();
var passport = require("passport");
var User = require("../models/user");
var House = require("../models/house");
var Contact = require("../models/contact");
var middleware = require("../middleware");
var async = require("async");
var nodemailer = require("nodemailer");
var crypto = require("crypto");


// ROOT ROUTE
router.get("/", (req, res) => {
    res.render("landing");
});

// ABOUT US ROUTE
router.get("/about", (req, res) => {
    res.render("about", {
        page: "about"
    });
});

// CONTACT US ROUTE - Requires authentication
router.get("/contact", middleware.isLoggedIn, (req, res) => {
    // Additional check to ensure user data is available
    if (!req.user) {
        req.flash("error", "Authentication required. Please log in again.");
        return res.redirect("/login");
    }
    
    res.render("contact", {
        page: "contact",
        currentUser: req.user // Explicitly pass currentUser
    });
});

// CONTACT US POST ROUTE - Requires authentication
router.post("/contact", middleware.isLoggedIn, async (req, res) => {
    try {
        // Validate required fields
        const { name, email, subject, message } = req.body;
        
        if (!name || !email || !subject || !message) {
            req.flash("error", "Please fill in all required fields.");
            return res.redirect("/contact");
        }
        
        // Create new contact entry with user information
        const newContact = new Contact({
            name: name.trim(),
            email: email.trim().toLowerCase(),
            subject: subject.trim(),
            message: message.trim(),
            userId: req.user._id, // Add user ID reference
            userInfo: {
                username: req.user.username,
                firstName: req.user.firstName,
                lastName: req.user.lastName
            }
        });
        
        // Save to database
        await newContact.save();
        
       
        
        req.flash("success", "Thank you for your message! We'll get back to you soon.");
        res.redirect("/contact");
        
    } catch (error) {
        console.error('Contact form error:', error);
        req.flash("error", "Something went wrong. Please try again later.");
        res.redirect("/contact");
    }
});

// AUTH ROUTES
// ==============

// REGISTER ROUTE - shows register form
router.get("/register", (req, res) => {
    res.render("register", {
        page: "register"
    });
});

// handles user sign up
router.post("/register", (req, res) => {
    var newUser = new User({
        username: req.body.username,
        firstName: req.body.firstName,
        lastName: req.body.lastName,
        email: req.body.email,
        avatar: req.body.avatar
    });

    User.register(newUser, req.body.password, (err, user) => {
        if (err) {
            req.flash("error", err.message);
            return res.redirect("/register");
        }
        passport.authenticate("local")(req, res, function () {
            req.flash("success", "Welcome to RentEase " + user.username);
            res.redirect("/houses");
        });
    });
});

// LOGIN ROUTES
// show login form
router.get("/login", (req, res) => {
    res.render("login", {
        page: "login"
    });
});

// router.post("/login", "middleware", "callback")
// login logic - middleware
router.post("/login", passport.authenticate("local", {
        successRedirect: "/houses",
        failureRedirect: "/login",
        failureFlash: true
    }),
    // callback
    (req, res) => {});

// LOGOUT ROUTE
router.get("/logout", (req, res) => {
    req.logout();
    req.flash("success", "Logged you out!");
    res.redirect("/houses");
});

// FORGOT PASSWORD
// forgot password
router.get('/forgot', function (req, res) {
    res.render('forgot');
});

// Creates token to reset password
router.post('/forgot', function (req, res, next) {
    async.waterfall([
        function (done) {
            crypto.randomBytes(20, function (err, buf) {
                var token = buf.toString('hex');
                done(err, token);
            });
        },
        function (token, done) {
            User.findOne({
                email: req.body.email
            }, function (err, user) {
                if (!user) {
                    req.flash('error', 'No account with that email address exists.');
                    return res.redirect('/forgot');
                }

                user.resetPasswordToken = token;
                user.resetPasswordExpires = Date.now() + 3600000; // 1 hour

                user.save(function (err) {
                    done(err, token, user);
                });
            });
        },

        
    ], function (err) {
        if (err) return next(err);
        res.redirect('/forgot');
    });
});

// 
router.get('/reset/:token', function (req, res) {
    User.findOne({
        resetPasswordToken: req.params.token,
        resetPasswordExpires: {
            $gt: Date.now()
        }
    }, function (err, user) {
        if (!user) {
            req.flash('error', 'Password reset token is invalid or has expired.');
            return res.redirect('/forgot');
        }
        res.render('reset', {
            token: req.params.token
        });
    });
});

// Reset password after given token
router.post('/reset/:token', function (req, res) {
    async.waterfall([
        function (done) {
            User.findOne({
                resetPasswordToken: req.params.token,
                resetPasswordExpires: {
                    $gt: Date.now()
                }
            }, function (err, user) {
                if (!user) {
                    req.flash('error', 'Password reset token is invalid or has expired.');
                    return res.redirect('back');
                }
                if (req.body.password === req.body.confirm) {
                    user.setPassword(req.body.password, function (err) {
                        user.resetPasswordToken = undefined;
                        user.resetPasswordExpires = undefined;

                        user.save(function (err) {
                            req.logIn(user, function (err) {
                                done(err, user);
                            });
                        });
                    })
                } else {
                    req.flash("error", "Passwords do not match.");
                    return res.redirect('back');
                }
            });
        },
        function (user, done) {
            var smtpTransport = nodemailer.createTransport({
                service: 'Gmail',
                auth: {
                    user: 'myEmailTesterRequest@gmail.com',
                    pass: "Tester99"
                }
            });
            var mailOptions = {
                to: user.email,
                from: 'myEmailTesterRequest@gmail.com',
                subject: 'Your password has been changed',
                text: 'Hello,\n\n' +
                    'This is a confirmation that the password for your account ' + user.email + ' has just been changed.\n'
            };
            smtpTransport.sendMail(mailOptions, function (err) {
                req.flash('success', 'Success! Your password has been changed.');
                done(err);
            });
        }
    ], function (err) {
        res.redirect('/houses');
    });
});

// USERS PROFILE
router.get("/users/:id", (req, res) => {
    User.findById(req.params.id, (err, foundUser) => {
        if (err) {
            req.flash("error", "Something went wrong");
            res.redirect("back");
        }
        House.find().where("author.id").equals(foundUser._id).exec((err, houses) => {
            if (err) {
                req.flash("error", "Something went wrong");
                return res.redirect("/");
            }
            res.render("users/show", {
                user: foundUser,
                houses: houses
            });
        });
    });
});


module.exports = router;
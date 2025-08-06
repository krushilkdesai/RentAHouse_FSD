var mongoose = require("mongoose");

// CONTACT MODEL - for contact form submissions
var contactSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },
    email: {
        type: String,
        required: true,
        trim: true,
        lowercase: true
    },
    subject: {
        type: String,
        required: true,
        trim: true
    },
    message: {
        type: String,
        required: true,
        trim: true
    },
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
    },
    userInfo: {
        username: String,
        firstName: String,
        lastName: String
    },
    status: {
        type: String,
        enum: ['new', 'read', 'replied', 'resolved'],
        default: 'new'
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    resolvedAt: {
        type: Date
    },
    adminNotes: {
        type: String,
        trim: true
    }
});

// Add index for better query performance
contactSchema.index({ createdAt: -1 });
contactSchema.index({ status: 1 });
contactSchema.index({ email: 1 });

module.exports = mongoose.model("Contact", contactSchema);

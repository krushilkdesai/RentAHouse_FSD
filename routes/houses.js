var express = require('express');
var router = express.Router();
var House = require('../models/house');
var middleware = require('../middleware');
var Review = require('../models/review');
var Comment = require('../models/comment');

// Multer/Cloudinary
var multer = require('multer');
var fs = require('fs');
var path = require('path');

// Ensure uploads directory exists
var uploadsDir = path.join(__dirname, '../public/uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

var storage = multer.diskStorage({
    destination: function(req, file, cb) {
        cb(null, uploadsDir);
    },
    filename: function(req, file, cb) {
        cb(null, Date.now() + '-' + file.originalname);
    }
});
var imageFilter = function(req, file, cb) {
    // accept image files only
    if (!file.originalname.match(/\.(jpg|jpeg|png|gif)$/i)) {
        return cb(new Error('Only image files are allowed!'), false);
    }
    cb(null, true);
};
var upload = multer({
    storage: storage,
    fileFilter: imageFilter
});

//INDEX - Show all houses
router.get('/', function(req, res) {
	var perPage = 8;
	var pageQuery = parseInt(req.query.page);
	var pageNumber = pageQuery ? pageQuery : 1;
	if (req.query.search) {
		// Fuzzy Search
		const regex = new RegExp(escapeRegex(req.query.search), 'gi');
		House.find({
			$or: [
				{
					name: regex
				},
				{
					location: regex
				}
			]
		})
			.skip(perPage * pageNumber - perPage)
			.limit(perPage)
			.exec(function(err, allHouses) {
				House.count({
					$or: [
						{ name: regex },
						{ location: regex }
					]
				}).exec(function(err, count) {
					if (err) {
						req.flash('error', err.message);
						res.redirect('back');
					} else {
						// If fuzzy search not found
						if (allHouses.length < 1) {
							req.flash(
								'error',
								'No houses match that search, please try again.'
							);
							return res.redirect('back');
						}
						res.render('houses/index', {
							houses: allHouses,
							current: pageNumber,
							pages: Math.ceil(count / perPage),
							search: req.query.search
						});
					}
				});
			});
	} else {
		// get all houses from DB
		House.find({})
			.skip(perPage * pageNumber - perPage)
			.limit(perPage)
			.exec(function(err, allHouses) {
				House.count().exec(function(err, count) {
					if (err) {
						console.log(err);
					} else {
						res.render('houses/index', {
							houses: allHouses,
							current: pageNumber,
							pages: Math.ceil(count / perPage),
							search: false
						});
					}
				});
			});
	}
});

// CREATE - Add new houses to DB
router.post('/', middleware.isLoggedIn, upload.array('images', 10), (req, res) => {
    if (!req.files || req.files.length === 0) {
        req.flash('error', 'No files uploaded.');
        return res.redirect('back');
    }
    
    // Create array of image paths
    const imagePaths = req.files.map(file => '/uploads/' + file.filename);
    
    // Set the images array and also set the first image as the main image for backward compatibility
    req.body.house.images = imagePaths;
    req.body.house.image = imagePaths[0]; // First image as main image
    
    req.body.house.author = {
        id: req.user._id,
        username: req.user.username
    };
    // Ensure contact fields are present
    req.body.house.contactName = req.body.house.contactName || req.body.house['contactName'] || req.body.house['contact_name'] || '';
    req.body.house.contactMobile = req.body.house.contactMobile || req.body.house['contactMobile'] || req.body.house['contact_mobile'] || '';
    req.body.house.contactEmail = req.body.house.contactEmail || req.body.house['contactEmail'] || req.body.house['contact_email'] || '';
    
    House.create(req.body.house, function(err, house) {
        if (err) {
            req.flash('error', err.message);
            return res.redirect('back');
        }
        res.redirect('/houses/' + house.id);
    });
});

// NEW - Show form to create new house
router.get('/new', middleware.isLoggedIn, (req, res) => {
	res.render('houses/new');
});

// SHOW - Shows more info about one house
router.get('/:id', (req, res) => {
	// Find house with provided ID
	House.findById(req.params.id)
		.populate('comments likes')
		.populate({
			path: 'reviews',
			options: {
				sort: {
					createdAt: -1
				}
			}
		})
		.exec(function(err, foundHouse) {
			if (err || !foundHouse) {
				req.flash('error', 'House not found');
				res.redirect('back');
			} else {
				console.log(foundHouse);
				//render show template with that house
				res.render('houses/show', {
					house: foundHouse
				});
			}
		});
});

// EDIT HOUSE ROUTE
router.get('/:id/edit', middleware.checkHouseOwnership, (req, res) => {
	House.findById(req.params.id, (err, foundHouse) => {
		res.render('houses/edit', {
			house: foundHouse
		});
	});
});

// UPDATE HOUSE ROUTE
router.put(
	'/:id',
	middleware.checkHouseOwnership,
	upload.array('images', 10),
	(req, res) => {
		House.findById(req.params.id, async function(err, house) {
			if (err) {
				req.flash('error', err.message);
				res.redirect('back');
			} else {
				if (req.files && req.files.length > 0) {
					// Create array of new image paths
					const newImagePaths = req.files.map(file => '/uploads/' + file.filename);
					
					// Update images array and set first image as main image
					house.images = newImagePaths;
					house.image = newImagePaths[0]; // First image as main image
				}
				
				// Update other fields
				house.name = req.body.house.name || req.body.name;
				house.price = req.body.house.price || req.body.price;
				house.bedrooms = req.body.house.bedrooms || req.body.bedrooms;
				house.beds = req.body.house.beds || req.body.beds;
				house.bathrooms = req.body.house.bathrooms || req.body.bathrooms;
				house.location = req.body.house.location || req.body.location;
				house.description = req.body.house.description || req.body.description;
				house.contactName = req.body.house.contactName || req.body.contactName || house.contactName;
				house.contactMobile = req.body.house.contactMobile || req.body.contactMobile || house.contactMobile;
				house.contactEmail = req.body.house.contactEmail || req.body.contactEmail || house.contactEmail;
				
				house.save();
				req.flash('success', 'Successfully Updated!');
				res.redirect('/houses/' + house._id);
			}
		});
	}
);

// DESTROY HOUSE ROUTE
router.delete('/:id', middleware.checkHouseOwnership, function(req, res) {
	House.findById(req.params.id, function(err, house) {
		if (err) {
			res.redirect('/houses');
		} else {
			// deletes all comments associated with the house
			Comment.remove(
				{
					_id: {
						$in: house.comments
					}
				},
				function(err) {
					if (err) {
						console.log(err);
						return res.redirect('/houses');
					}
					// deletes all reviews associated with the house
					Review.remove(
						{
							_id: {
								$in: house.reviews
							}
						},
						function(err) {
							if (err) {
								console.log(err);
								return res.redirect('/houses');
							}
							//  delete the house
							house.remove();
							req.flash('success', 'House deleted successfully!');
							res.redirect('/houses');
						}
					);
				}
			);
		}
	});
});

// House Like Route
router.post('/:id/like', middleware.isLoggedIn, function(req, res) {
	House.findById(req.params.id, function(err, foundHouse) {
		if (err) {
			console.log(err);
			return res.redirect('/houses');
		}
		// check if req.user._id exists in foundHouse.likes
		var foundUserLike = foundHouse.likes.some(function(like) {
			return like.equals(req.user._id);
		});
		if (foundUserLike) {
			// user already liked, removing like
			foundHouse.likes.pull(req.user._id);
		} else {
			// adding the new user like
			foundHouse.likes.push(req.user);
		}

		foundHouse.save(function(err) {
			if (err) {
				req.flash('error', err.message);
				return res.redirect('/houses');
			}
			return res.redirect('/houses/' + foundHouse._id);
		});
	});
});

function escapeRegex(text) {
	return text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
}

module.exports = router;

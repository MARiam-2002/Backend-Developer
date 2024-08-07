import mealsModel from "../../../../DB/model/meals.model.js";
import cloudinary from "../../../utils/cloudinary.js";
import { nanoid } from "nanoid";
import { asyncHandler } from "../../../utils/errorHandling.js";
import slugify from "slugify";

import userModel from "../../../../DB/model/User.model.js";

export const addAnewRecipe = asyncHandler(async (req, res, next) => {
  const {
    recipeName,
    information,
    typeMeals,
    times,
    EnoughFor,
    calories,
    ingredients,
    steps,
  } = req.body;

  if (!req.file) {
    return next(new Error("meal image is required", { cause: 400 }));
  }
  const cloudFolder = nanoid();

  const { secure_url, public_id } = await cloudinary.uploader.upload(
    req.file.path,
    {
      folder: `${process.env.FOLDER_CLOUDINARY}/meals/${cloudFolder}`,
    }
  );

  const meal = await mealsModel.create({
    recipeName,
    user: req.user._id,
    information,
    typeMeals,
    times,
    EnoughFor,
    calories,
    ingredients: JSON.parse(ingredients),
    steps: JSON.parse(steps),
    cloudFolder,
    user: req.user._id,
    image: { url: secure_url, id: public_id },
    slug: slugify(req.body.recipeName),
  });

  return res.status(201).json({ success: true, data: meal });
});
const fetch = (...args) =>
  import("node-fetch").then(({ default: fetch }) => fetch(...args));

export const recommendMeal = asyncHandler(async (req, res, next) => {
  let ingredients = req.body.ingredients;
  const { lang } = req.query;
  const user = await userModel.findById(req.user._id);
  const url = `https://wanna-meal.onrender.com/recommend?input_ingredients_str=${ingredients}`;
  const options = {
    method: "GET",
    headers: {
      "X-RapidAPI-Host": "famous-quotes4.p.rapidapi.com",
      "X-RapidAPI-Key": "your-rapidapi-key",
    },
    timeout: 10000,
  };

  try {
    let response = await fetch(url, options);
    response = await response.json();
    for (let res of response.Recommendation) {
      const { secure_url, public_id } = await cloudinary.uploader.upload(
        res.image,
        {
          folder: `${process.env.FOLDER_CLOUDINARY}/recommend`,
        }
      );
      res.image = { url: secure_url, id: public_id };

      let meal = user.wishlist.find((meal) => meal === res._id.toString());
      const newMeal = await mealsModel.findById(meal);


      if (newMeal) {
        res._id = newMeal._id;
        res.recipeName = newMeal.recipeName;
        res.typeMeals = newMeal.typeMeals;
        res.ingredients = newMeal.ingredients;
        res.steps = newMeal.steps;
        res.image = newMeal.image;
        res.times = newMeal.times;
        res.EnoughFor = newMeal.EnoughFor;
        res.calories = newMeal.calories;
        res.isSaved = newMeal.isSaved;
      }
    }
    res.status(200).json(response);
  } catch (err) {
    console.log(err);
    res.status(500).json({ msg: `Internal Server Error.` });
  }
});

export const getallMeal = asyncHandler(async (req, res, next) => {
  const products = await mealsModel
    .find({ ...req.query })
    .pagination(req.query.page)
    .customSelect(req.query.fields)
    .sort(req.query.sort);
  return res.status(200).json({ success: true, result: products });
});

// get a meal
export const getMealId = asyncHandler(async (req, res, next) => {
  const meals = await mealsModel.findById(req.params.mealId);
  if (!meals) {
    return next(new Error("mealId not found", { cause: 404 }));
  }
  return res.json({ success: true, result: meals });
});

//delete a meal
export const deleteMeal = asyncHandler(async (req, res, next) => {
  const meal = await mealsModel.findById(req.params.mealId);
  if (!meal) {
    return next(new Error("mealId not found", { cause: 404 }));
  }

  if (req.user._id.toString() !== meal.user.toString()) {
    return next(new Error("not allawed to delete", { cause: 401 }));
  }

  const result = await cloudinary.uploader.destroy(meal.image.id);
  await cloudinary.api.delete_folder(
    `${process.env.FOLDER_CLOUDINARY}/meals/${meal.cloudFolder}`
  );

  await mealsModel.findByIdAndDelete(req.params.mealId);
  return res
    .status(200)
    .json({ success: true, message: "meal delete successfully!" });
});

export const rattingMeal = asyncHandler(async (req, res, next) => {
  const { mealId } = req.params;
  const user = await userModel.findById(req.user._id);
  const rating = req.body.rating;
  if (rating < 0 || rating > 5) {
    return next(new Error("rating must be between 0 and 5", { cause: 400 }));
  }
  const existingRating = user.ratings.find(
    (r) => r.mealId.toString() === mealId.toString()
  );

  if (existingRating) {
    existingRating.rating = rating;
  } else {
    user.ratings.push({ mealId, rating });
  }

  await user.save();

  return res.status(200).json({
    success: true,
    message: "rating added",
    data: { ratings: user.ratings },
  });
});

export const getUserRatting = asyncHandler(async (req, res, next) => {
  const users = await userModel
    .find({})
    .select("_id userName ratings.mealId ratings.rating");
  if (!users) {
    return next(new Error("user not found", { cause: 404 }));
  }
  return res.status(200).json({ success: true, users });
});

export const commonMeals = asyncHandler(async (req, res, next) => {
  const userId = req.user._id;
  try {
    let response = await fetch(
      `https://colls.onrender.com/recommend?user_id=${userId}`,
      {
        method: "Get",
      }
    );

    if (!response.ok) {
      throw new Error(`Error! status: ${response.status}`);
    }

    response = await response.json();
    for (let res of response) {
      // const checkAndUploadImage = async (res) => {
      //   try {
      //     // Define the folder and the image name
      //     const folder = `${process.env.FOLDER_CLOUDINARY}/recommend/${res.name}`;
      //     const imageName = res.img_link;

      //     // Search for the image in the specified folder
      //     const result = await cloudinary.search
      //       .expression(`folder:${folder} AND filename:${imageName}`)
      //       .execute();

      //     if (result.total_count > 0) {
      //       // Image already exists
      //       console.log('Image already exists in Cloudinary:', result.resources[0]);
      //       res.img_link = {
      //         url: result.resources[0].secure_url,
      //         id: result.resources[0].public_id,
      //       };
      //     } else {
      //       // Image does not exist, upload it
      //       const { secure_url, public_id } = await cloudinary.uploader.upload(imageName, {
      //         folder: folder,
      //       });
      //       res.img_link = { url: secure_url, id: public_id };
      //     }
      //   } catch (error) {
      //     console.error('Error checking or uploading image to Cloudinary:', error);
      //   }
      // };
      const { secure_url, public_id } = await cloudinary.uploader.upload(
        res.image,
        {
          folder: `${process.env.FOLDER_CLOUDINARY}/commonMeal`,
        }
      );
      res.image = { url: secure_url, id: public_id };
    }
    return res.status(200).json(response);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export const isSaved = asyncHandler(async (req, res, next) => {
  const {
    _id,
    recipeName,
    image,
    typeMeals,
    ingredients,
    steps,
    calories,
    times,
    EnoughFor,
  } = req.body;
  const { id } = req.query;
  if (_id.toString() !== id) {
    return next(
      new Error("id not match in query Url and body", { cause: 400 })
    );
  }
  let meal = await mealsModel.findOne({ _id: id });
  let user = await userModel.findById({
    _id: req.user._id,
  });
  if (meal) {
    if (meal.isSaved) {
      meal.isSaved = false;
      await meal.save();
      user.wishlist = await user.wishlist.filter(
        (meal) => meal !== _id.toString()
      );
      console.log(user.wishlist);
      await user.save();
    } else {
      meal.isSaved = true;
      await meal.save();
      if (!user.wishlist.find((meal) => meal === _id)) {
        user.wishlist.push(_id);
        await user.save();
      }
    }
  } else {
    const cloudFolder = nanoid();
    const { secure_url, public_id } = await cloudinary.uploader.upload(image, {
      folder: `${process.env.FOLDER_CLOUDINARY}/meals/${cloudFolder}`,
    });
    meal = await mealsModel.create({
      _id,
      recipeName,
      typeMeals,
      calories,
      times,
      EnoughFor,
      image: { url: secure_url, id: public_id },
      cloudFolder,
      ingredients,
      steps,
      user: req.user._id,
      slug: slugify(req.body.recipeName),
    });

    user.wishlist.push(_id);
    await user.save();
    meal.isSaved = true;
    await meal.save();
  }

  return res.status(200).json({ Recommendation: meal });
});

export const getSavedMeals = asyncHandler(async (req, res, next) => {
  const user = await userModel.findById(req.user._id).populate({
    path: "wishlist",
    model: "Meals",
  });
  return res.status(200).json({ success: true, data: user.wishlist });
});

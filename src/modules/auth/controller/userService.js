import asyncHandler from "express-async-handler";
import bcryptjs from "bcryptjs";

import cloudinary from "../../../utils/cloudinary.js";
import User from "../../../../DB/model/User.model.js";
import ApiFeatures from "../../../utils/apiFeatures.js";
import ApiError from "../../../utils/apiError.js";

//******************admin */
export const getUsers = asyncHandler(async (req, res, next) => {
  let filter = {};
  if (req.filterObj) {
    filter = req.filterObj;
  }
  // build query
  const docCount = await User.countDocuments();
  const apiFeatures = new ApiFeatures(User.find(filter), req.query)
    .paginate(docCount)
    .filter()
    .sort()
    .limitFields();
  // execute query
  const { mongooseQuery, paginationResult } = apiFeatures;
  const users = await mongooseQuery;

  res
    .status(200)
    .json({ results: users.length, paginationResult, data: users });
});

export const getUser = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  const user = await User.findById(id);

  if (!user) {
    return next(new ApiError(`No subcategory for this id ${id}`, 404));
  }
  res.status(200).json({ data: user });
});

export const createUser = asyncHandler(async (req, res, next) => {
  const { userName, email, password } = req.body;
  const isUser = await User.findOne({ email });
  if (isUser) {
    return next(new Error("email already registered !", { cause: 409 }));
  }

  const hashPassword = bcryptjs.hashSync(
    password,
    Number(process.env.SALT_ROUND)
  );
  const user = await User.create({
    userName,
    email,
    password: hashPassword,
  });
  res.status(201).json({ data: user });
});
// without password
export const updateUser = asyncHandler(async (req, res, next) => {
  const user = await User.findByIdAndUpdate(
    req.params.id,
    {
      userName: req.body.userName,
      slug: req.body.slug,
      phone: req.body.phone,
      email: req.body.email,
      role: req.body.role,
    },
    { new: true }
  );
  if (!user) {
    return next(new ApiError(`No user for this id ${req.params.id}`, 404));
  }
  res.status(200).json({ data: user });
});

export const deleteUser = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  const user = await User.findByIdAndDelete(id);

  if (!user) {
    return next(new ApiError(`No user for this id ${id}`, 404));
  }
  res.status(204).send();
});

//****************user */

export const getLoggedUserData = asyncHandler(async (req, res, next) => {
  req.params.id = req.user._id;
  next();
});

// export const updateLoggedUserData = asyncHandler(async (req, res, next) => {
//   // const { secure_url, public_id } = await cloudinary.uploader.upload(
//   //   req.file.path,
//   //   {
//   //     folder: `${process.env.FOLDER_CLOUDINARY}/userPic`,
//   //   }
//   // );
//   let secure_url, public_id;

//   if (req.file) {
//     const uploadResult = await cloudinary.uploader.upload(req.file.path, {
//       folder: `${process.env.FOLDER_CLOUDINARY}/userPic`,
//     });
//     secure_url = uploadResult.secure_url;
//     public_id = uploadResult.public_id;
//   }
//   // remove the photo
//   if (req.body.removeProfileImage) {
//     secure_url = null;
//     public_id = null;
//   }

//   const updatedUser = await User.findByIdAndUpdate(
//     req.user._id,
//     {
//       userName: req.body.userName,
//       email: req.body.email,
//       phone: req.body.phone,
//       profileImage: { url: secure_url, id: public_id },
//       password: await bcryptjs.hash(req.body.password, 12),
//       passwordChangedAt: Date.now(),
//     },
//     { new: true }
//   );

//   res.status(200).json({ data: updatedUser });
// });

export const updateLoggedUserData = asyncHandler(async (req, res, next) => {
 
  let secure_url, public_id;

  //is there a photo 
  if (req.file) {
    const uploadResult = await cloudinary.uploader.upload(req.file.path, {
      folder: `${process.env.FOLDER_CLOUDINARY}/userPic`,
    });
    secure_url = uploadResult.secure_url;
    public_id = uploadResult.public_id;
  }

  //check if user want to remove his photo 
  if (req.body.removeProfileImage) {
    secure_url = null;
    public_id = null;
  }

  // hash the password
  let hashedPassword;
  if (req.body.password) {
    hashedPassword = await bcryptjs.hash(req.body.password, 12);
  }

  const updateData = {
    userName: req.body.userName,
    email: req.body.email,
    phone: req.body.phone,
  };

  // check there is a photo ,or there ia an ask to remove it 
  if (secure_url !== undefined) {
    updateData.profileImage = { url: secure_url, id: public_id };
  } else if (req.body.removeProfileImage) {
    updateData.profileImage = { url: null, id: null };
  }

  if (hashedPassword) {
    updateData.password = hashedPassword;
    updateData.passwordChangedAt = Date.now();
  }

  const updatedUser = await User.findByIdAndUpdate(
    req.user._id,
    updateData,
    { new: true }
  );

  res.status(200).json({ data: updatedUser });
});

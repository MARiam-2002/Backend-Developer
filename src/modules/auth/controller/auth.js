import { asyncHandler } from "../../../utils/errorHandling.js";
import bcryptjs from "bcryptjs";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import sendEmail from "../../../utils/email.js";
import { resetPassword, signupTemp } from "../../../utils/generateHtml.js";
import tokenModel from "../../../../DB/model/Token.model.js";
import randomstring from "randomstring";
import userModel from "../../../../DB/model/User.model.js";
import famillyModel from "../../../../DB/model/famillyMember.js";

export const register = asyncHandler(async (req, res, next) => {
  const { userName, email, password } = req.body;
  const isUser = await userModel.findOne({ email });
  if (isUser) {
    return next(new Error("email already registered !", { cause: 409 }));
  }

  const hashPassword = bcryptjs.hashSync(
    password,
    Number(process.env.SALT_ROUND)
  );
  const activationCode = crypto.randomBytes(64).toString("hex");

  const user = await userModel.create({
    userName,
    email,
    password: hashPassword,
    activationCode,
  });

  const link = `https://fast-plat1.vercel.app/auth/confirmEmail/${activationCode}`;

  const isSent = await sendEmail({
    to: email,
    subject: "Activate Account",
    html: signupTemp(link),
  });
  return isSent
    ? res
        .status(200)
        .json({ success: true, message: "Please review Your email!" })
    : next(new Error("something went wrong!", { cause: 400 }));
});
export const activationAccount = asyncHandler(async (req, res, next) => {
  const user = await userModel.findOneAndUpdate(
    { activationCode: req.params.activationCode },
    { isConfirmed: true, $unset: { activationCode: 1 } }
  );

  if (!user) {
    return next(new Error("User Not Found!", { cause: 404 }));
  }
  await famillyModel.create({ user: user._id });

  return res
    .status(200)
    .send("Congratulation, Your Account is now activated, try to login");
});

export const login = asyncHandler(async (req, res, next) => {
  const { email, password } = req.body;
  const user = await userModel.findOne({ email });

  if (!user) {
    return next(new Error("Invalid-Email", { cause: 400 }));
  }

  if (!user.isConfirmed) {
    return next(new Error("Un activated Account", { cause: 400 }));
  }

  const match = bcryptjs.compareSync(password, user.password);

  if (!match) {
    return next(new Error("Invalid-Password", { cause: 400 }));
  }

  const token = jwt.sign(
    { id: user._id, email: user.email },
    process.env.TOKEN_SIGNATURE
  );

  await tokenModel.create({
    token,
    user: user._id,
    agent: req.headers["user-agent"],
  });

  user.status = "online";
  await user.save();

  return res.status(200).json({ success: true, result: token });
});

//send forget Code

export const sendForgetCode = asyncHandler(async (req, res, next) => {
  const user = await userModel.findOne({ email: req.body.email });

  if (!user) {
    return next(new Error("Invalid email!", { cause: 400 }));
  }

  const code = randomstring.generate({
    length: 5,
    charset: "numeric",
  });

  user.forgetCode = code;
  await user.save();
  const token = jwt.sign(
    { id: user._id, email: user.email },
    process.env.TOKEN_SIGNATURE
  );
  await tokenModel.create({
    token,
    user: user._id,
    agent: req.headers["user-agent"],
  });
  return (await sendEmail({
    to: user.email,
    subject: "Reset Password",
    html: resetPassword(code),
  }))
    ? res
        .status(200)
        .json({ success: true, message: "check you email!", token })
    : next(new Error("Something went wrong!", { cause: 400 }));
});

export const resetPasswordByCode = asyncHandler(async (req, res, next) => {
  const newPassword = bcryptjs.hashSync(
    req.body.password,
    +process.env.SALT_ROUND
  );
  const user = await userModel.findOneAndUpdate(
    { email: req.user.email },
    { password: newPassword }
  );

  //invalidate tokens
  const tokens = await tokenModel.find({ user: user._id });

  tokens.forEach(async (token) => {
    token.isValid = false;
    await token.save();
  });

  return res.status(200).json({ success: true, message: "Try to login!" });
});

export const VerifyCode = asyncHandler(async (req, res, next) => {
  const user = await userModel.findOne({ email: req.user.email });
  if (!user.forgetCode) {
    return next(new Error("go to resend forget code", { status: 400 }));
  }
  if (user.forgetCode !== req.body.forgetCode) {
    return next(new Error("Invalid code!", { status: 400 }));
  }
  await userModel.findOneAndUpdate(
    { email: req.user.email },
    { $unset: { forgetCode: 1 } }
  );

  return res
    .status(200)
    .json({ success: true, message: "go to reset new password" });
});

// get all users
// role ==> admin
export const getUsers = asyncHandler(async (req, res) => {
  //pagination
  const page = req.query.page * 1 || 1;
  const limit = req.query.limit * 1 || 10;
  const skip = (page - 1) * limit;

  const users = await userModel.find({}).skip(skip).limit(limit);
  res.status(200).json({ results: users.length, page, data: users });
});

//get specific user
// role ==> admin
export const getUser = asyncHandler(async (req, res) => {
  const user = await userModel.findById(req.params.id);
  if (!user) {
    res.status(404).json({ message: "User not found" });
    return;
  }
  res.status(200).json(user);
});

//update logged user data (wihout role and password)
export const updateLoggedUserData = asyncHandler(async (req, res, next) => {
  const updatedUser = await userModel.findByIdAndUpdate(
    req.user._id,
    {
      name: req.body.name,
      email: req.body.email,
      phone: req.body.phone,
    },
    { new: true }
  );
  res.status(200).json({data : updatedUser});
});

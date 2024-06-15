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
import mongoose from "mongoose";
import cloudinary from "../../../utils/cloudinary.js";
import postModel from "../../../../DB/model/post.model.js";
import { translate } from "@vitalets/google-translate-api";

export const register = asyncHandler(async (req, res, next) => {
  const { userName, email, password } = req.body;
  const isUser = await userModel.findOne({
    $or: [
      {
        email,
      },
      {
        userName,
      },
    ],
  });
  if (isUser) {
    if (req.query.lang === "eng") {
      return next(
        new Error("email or userName already registered !", { cause: 409 })
      );
    }
    return next(
      new Error("البريد الالكتروني او اسم المستخدم مستخدم مسبقا", {
        cause: 409,
      })
    );
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
  if (req.query.lang === "eng") {
    return isSent
      ? res
          .status(200)
          .json({ success: true, message: "Please review Your email!" })
      : next(new Error("something went wrong!", { cause: 400 }));
  }
  return isSent
    ? res
        .status(200)
        .json({ success: true, message: "يرجى مراجعة بريدك الالكتروني!" })
    : next(new Error("حدث خطأ ما!", { cause: 400 }));
});
export const activationAccount = asyncHandler(async (req, res, next) => {
  const user = await userModel.findOneAndUpdate(
    { activationCode: req.params.activationCode },
    { isConfirmed: true, $unset: { activationCode: 1 } }
  );

  if (!user) {
    if (req.query.lang === "eng") {
      return next(new Error("User Not Found!", { cause: 404 }));
    }
    return next(new Error("المستخدم غير موجود!", { cause: 404 }));
  }
  await famillyModel.create({ user: user._id });
  if (req.query.lang === "eng") {
    return res
      .status(200)
      .send("Congratulation, Your Account is now activated, try to login");
  }
  return res
    .status(200)
    .send("تهانينا، تم تنشيط حسابك الآن، حاول تسجيل الدخول");
});

export const login = asyncHandler(async (req, res, next) => {
  const { email, password } = req.body;
  const user = await userModel.findOne({ email });

  if (!user) {
    if (req.query.lang === "eng") {
      return next(new Error("Invalid-Email", { cause: 400 }));
    }
    return next(new Error("البريد الالكتروني غير صحيح", { cause: 400 }));
  }

  if (!user.isConfirmed) {
    if (req.query.lang === "eng") {
      return next(new Error("Un activated Account", { cause: 400 }));
    }
    return next(new Error("حساب غير مفعل", { cause: 400 }));
  }

  const match = bcryptjs.compareSync(password, user.password);

  if (!match) {
    if (req.query.lang === "eng") {
      return next(new Error("Invalid-Password", { cause: 400 }));
    }
    return next(new Error("كلمة المرور غير صحيحة", { cause: 400 }));
  }

  const token = jwt.sign(
    { id: user._id, email: user.email, isPremium: user.isPremium },
    process.env.TOKEN_SIGNATURE
  );

  await tokenModel.create({
    token,
    user: user._id,
    agent: req.headers["user-agent"],
  });

  user.status = "online";
  await user.save();

  return res.status(200).json({
    success: true,
    token,
    data: {
      userName:
        req.query.lang === "eng"
          ? userName
          : (await translate(user.userName, { to: "ar" })).text,
      profileImage: user.profileImage,
    },
  });
});

//send forget Code

export const sendForgetCode = asyncHandler(async (req, res, next) => {
  const user = await userModel.findOne({ email: req.body.email });

  if (!user) {
    if (req.query.lang === "eng") {
      return next(new Error("Invalid email!", { cause: 400 }));
    }
    return next(new Error("البريد الالكتروني غير صحيح", { cause: 400 }));
  }

  const code = randomstring.generate({
    length: 5,
    charset: "numeric",
  });

  user.forgetCode = code;
  await user.save();
  const token = jwt.sign(
    { id: user._id, email: user.email, isPremium: user.isPremium },
    process.env.TOKEN_SIGNATURE
  );
  await tokenModel.create({
    token,
    user: user._id,
    agent: req.headers["user-agent"],
  });
  return (await sendEmail({
    to: user.email,
    subject:
      req.query.lang === "eng" ? "Reset Password" : "إعادة تعيين كلمة المرور",
    html: resetPassword(code),
  }))
    ? res.status(200).json({
        success: true,
        message:
          req.query.lang === "eng"
            ? "check you email!"
            : "تحقق من البريد الإلكتروني الخاص بك",
        token,
      })
    : next(
        req.query.lang === "eng"
          ? new Error("Something went wrong!", { cause: 400 })
          : new Error("حدث خطأ ما!", { cause: 400 })
      );
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

  return res.status(200).json({
    success: true,
    message: req.query.lang === "eng" ? "Try to login!" : "حاول تسجيل الدخول",
  });
});

export const VerifyCode = asyncHandler(async (req, res, next) => {
  const user = await userModel.findOne({ email: req.user.email });
  if (!user.forgetCode) {
    return next(
      req.query.lang === "eng"
        ? new Error("go to resend forget code", { status: 400 })
        : new Error("انتقل لإعادة إرسال كود التاكيد", { status: 400 })
    );
  }
  if (user.forgetCode !== req.body.forgetCode) {
    return next(
      req.query.lang === "eng"
        ? new Error("Invalid code!", { status: 400 })
        : new Error("كود غير صحيح!", { status: 400 })
    );
  }
  await userModel.findOneAndUpdate(
    { email: req.user.email },
    { $unset: { forgetCode: 1 } }
  );

  return res.status(200).json({
    success: true,
    message:
      req.query.lang === "eng"
        ? "go to reset new password"
        : "انتقل لإعادة تعيين كلمة المرور",
  });
});

export const followUnFollowUser = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  const userToModify = await userModel.findById(id);
  const currentUser = await userModel.findById(req.user._id);
  if (id.toString() === req.user._id.toString()) {
    return next(
      req.query.lang === "eng"
        ? new Error("You can't follow/unfollow yourself!", { cause: 400 })
        : new Error("لا يمكنك متابعة نفسك!", { cause: 400 })
    );
  }
  if (!userToModify || !currentUser) {
    return next(
      req.query.lang === "eng"
        ? new Error("User not found!", { cause: 404 })
        : new Error("المستخدم غير موجود!", { cause: 404 })
    );
  }
  const isFollowing = currentUser.following.includes(id);
  if (isFollowing) {
    //unfollow user
    await userModel.findByIdAndUpdate(req.user._id, {
      $pull: { following: id },
    });
    await userModel.findByIdAndUpdate(id, {
      $pull: { followers: req.user._id },
    });
    return res.status(200).json({
      success: true,
      message:
        req.query.lang === "eng"
          ? "User unfollowed successfully!"
          : "تم إلغاء متابعة المستخدم بنجاح!",
    });
  } else {
    //follow user
    await userModel.findByIdAndUpdate(req.user._id, {
      $push: { following: id },
    });
    await userModel.findByIdAndUpdate(id, {
      $push: { followers: req.user._id },
    });
    return res.status(200).json({
      success: true,
      message:
        req.query.lang === "eng"
          ? "User followed successfully!"
          : "تم متابعة المستخدم بنجاح!",
    });
  }
});

export const update = asyncHandler(async (req, res, next) => {
  const { email, password, userName, bio } = req.body;
  const userId = req.user._id;
  let user = await userModel.findById(userId);
  if (!user) {
    if (req.query.lang === "eng") {
      return next(new Error("User not found!", { cause: 404 }));
    }
    return next(new Error("المستخدم غير موجود!", { cause: 404 }));
  }
  if (req.params.id.toString() !== userId.toString()) {
    return next(
      req.query.lang === "eng"
        ? new Error("You cannot update other user's profile ", { cause: 401 })
        : new Error("لا يمكنك تحديث ملف تعريف المستخدم الآخر", { cause: 401 })
    );
  }
  if (password) {
    const hashPassword = bcryptjs.hashSync(
      password,
      Number(process.env.SALT_ROUND)
    );
    user.password = hashPassword;
  }
  if (req.file) {
    if (
      user.profileImage.id ==
      "Screenshot_2024-04-27_093345-removebg-preview_t5oyup.png"
    ) {
      const { public_id, secure_url } = await cloudinary.uploader.upload(
        req.file.path,
        {
          folder: `${process.env.FOLDER_CLOUDINARY}/user/${user._id}`,
        }
      );
      user.profileImage.url = secure_url;
      user.profileImage.id = public_id;
    } else {
      const { public_id, secure_url } = await cloudinary.uploader.upload(
        req.file.path,
        {
          public_id: user.profileImage.id,
        }
      );
      user.profileImage.url = secure_url;
    }
  }
  user.email = email || user.email;
  user.userName = userName || user.userName;
  user.bio = bio || user.bio;
  user = await user.save();
  await postModel.updateMany(
    { "replies.userId": userId },
    {
      $set: {
        "replies.$[reply].userName": user.userName,
        "replies.$[reply].profileImage": user.profileImage,
      },
    },
    { arrayFilters: [{ "reply.userId": userId }] }
  );
  const userUpdated = await userModel.findById(user._id).select("-password");
  return res.status(200).json({
    message:
      req.query.lang === "eng"
        ? "profile updated successfully!"
        : "تم تحديث الملف الشخصي بنجاح!",
    userUpdated:
      req.query.lang === "eng"
        ? userUpdated
        : await translate(userUpdated, { to: "ar" }),
  });
});

export const getProfile = asyncHandler(async (req, res, next) => {
  const { query } = req.params;
  let user;
  if (mongoose.Types.ObjectId.isValid(query)) {
    user = await userModel
      .findOne({ _id: query })
      .select("-password -createdAt");
  } else {
    user = await userModel
      .findOne({
        userName: query,
      })
      .select("-password -createdAt");
  }
  if (!user) {
    if (req.query.lang === "eng") {
      return next(new Error("User not found!", { cause: 404 }));
    }
    return next(new Error("المستخدم غير موجود!", { cause: 404 }));
  }
  return res.status(200).json({
    success: true,
    user: req.query.lang === "eng" ? user : await translate(user, { to: "ar" }),
  });
});

export const getSuggestedUsers = asyncHandler(async (req, res, next) => {
  const userId = req.user._id;

  const usersFollowedByYou = await userModel
    .findById(userId)
    .select("following");

  const users = await userModel.aggregate([
    {
      $match: {
        _id: { $ne: userId },
      },
    },
    {
      $sample: { size: 10 },
    },
  ]);
  const filteredUsers = users.filter(
    (user) => !usersFollowedByYou.following.includes(user._id)
  );
  const suggestedUsers = filteredUsers.slice(0, 4);

  suggestedUsers.forEach((user) => (user.password = null));

  res.status(200).json({
    suggestedUsers:
      req.query.lang === "eng"
        ? suggestedUsers
        : await translate(suggestedUsers, { to: "ar" }),
  });
});

export const freezeAccount = asyncHandler(async (req, res, next) => {
  const user = await userModel.findById(req.user._id);
  if (!user) {
    if (req.query.lang === "eng") {
      return next(new Error("User not found!", { cause: 404 }));
    }
    return next(new Error("المستخدم غير موجود!", { cause: 404 }));
  }
  user.isFrozen = !user.isFrozen;
  await user.save();
  return res
    .status(200)
    .json({
      success: true,
      message:
        req.query.lang === "eng"
          ? "Account frozen successfully!"
          : "تم تجميد الحساب بنجاح!",
    });
});

export const updatePremium = asyncHandler(async (req, res, next) => {
  const { userId } = req.params;
  const { isPremium } = req.body;

  const user = await userModel.findById(userId);

  if (!user) {
    return res.status(404).send((req.query.lang === "eng")?"User not found":"المستخدم غير موجود");
  }

  user.isPremium = isPremium;
  await user.save();

  res.send((req.query.lang === "eng")?"User subscription status updated":"تم تحديث حالة اشتراك المستخدم");
});

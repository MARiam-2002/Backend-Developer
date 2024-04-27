import mongoose, { Schema, Types, model } from "mongoose";

const userSchema = new Schema(
  {
    userName: {
      type: String,
      required: true,
      min: 3,
      max: 20,
    },
    googleId: String,
    email: {
      type: String,
      unique: true,
      required: true,
      lowercase: true,
    },
    password: {
      type: String,
    },
    gender: {
      type: String,
      enum: ["male", "female"],
    },
    phone: String,
    status: {
      type: String,
      enum: ["online", "offline"],
      default: "offline",
    },
    role: {
      type: String,
      enum: ["user", "admin"],
      default: "user",
      required: true,
    },
    wishlist: [Types.ObjectId],
    isConfirmed: {
      type: Boolean,
      default: false,
    },
    forgetCode: String,
    activationCode: String,
    profileImage: {
      url: {
        type: String,
        default:
          "https://res.cloudinary.com/dgzucjqgi/image/upload/v1714199796/Screenshot_2024-04-27_093345-removebg-preview_v1b5gq.png",
      },
      id: {
        type: String,
        default:
          "Screenshot_2024-04-27_093345-removebg-preview_v1b5gq.png",
      },
    },
    coverImages: [
      {
        url: {
          type: String,
        },
        id: {
          type: String,
        },
      },
    ],
  },
  { timestamps: true }
);

const userModel = mongoose.models.userModel || model("User", userSchema);
export default userModel;

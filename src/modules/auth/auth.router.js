import { Router } from "express";
import * as Validators from "./auth.validation.js";
import { validation } from "../../middleware/validation.js";
import auth from "../../middleware/auth.js";
import * as userController from "./controller/auth.js";
import passport from "passport";

//////tip/////
// import { createTip, getAllTips } from '../tip/tipController.js';
// import {validate} from '../../middleware/tipValidate.js';
// import tipValidator from '../tip/tipValidator.js';

const router = Router();

router.get(
  "/google",
  passport.authenticate("google", { scope: ["profile", "email"] })
);
router.get("/login/failed", (req, res, next) => {
  res.status(401).json({ error: true, message: "login failure" });
});
router.get("/login/success", async (req, res, next) => {
  if (req.user) {
    req.user.status = "online";
    req.user.isConfirmed = true;
    await req.user.save();
    return res
      .status(200)
      .json({ error: false, message: "Successfully Login", user: req.user });
  } else {
    return res.status(403).json({ error: true, message: "not Authorized" });
  }
});
router.get("/logout", (req, res, next) => {
  req.logout();
  res.redirect("/");
});
router.get(
  "/google/redirect",
  passport.authenticate("google", {
    successRedirect: "https://fast-plat1.vercel.app/auth/login/success",
    failureRedirect: "https://fast-plat1.vercel.app/auth/login/failed",
  })
);
router.post(
  "/register",
  validation(Validators.registerSchema),
  userController.register
);

router.get(
  "/confirmEmail/:activationCode",
  validation(Validators.activateSchema),
  userController.activationAccount
);

router.post("/login", validation(Validators.login), userController.login);

//send forget password

router.patch(
  "/forgetCode",
  validation(Validators.forgetCode),
  userController.sendForgetCode
);
router.patch(
  "/VerifyCode",
  auth,
  validation(Validators.verify),
  userController.VerifyCode
);
router.patch(
  "/resetPassword",
  auth,
  validation(Validators.resetPassword),
  userController.resetPasswordByCode
);

router.get("/getusers", userController.getUsers);
router.get("/user:id", userController.getUser);
router.put("/updateMe", userController.updateLoggedUserData);

///////tip////////
// router.post('/tip', validate(tipValidator), createTip);
// router.get('/tips', getAllTips);
export default router;

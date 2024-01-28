import authRouter from "./modules/auth/auth.router.js";
import { globalErrorHandling } from "./utils/errorHandling.js";
import passport from "passport";
import pass from "../config/passport.stupp.js";
import session from "express-session";
import cors from "cors";
const initApp = (app, express) => {
  app.use(cors());
  //convert Buffer Data
  app.use(express.json());
  app.use(session({ secret: "secret", resave: true, saveUninitialized: true }));
  app.use(passport.initialize());
  app.use(passport.session());
  //Setup API Routing
  app.use(`/auth`, authRouter);

  app.all("*", (req, res, next) => {
    res.send("In-valid Routing Plz check url  or  method");
  });
  app.use(globalErrorHandling);
};

export default initApp;
const express = require("express");
const app = express();
const {
  MongoClient,
  ServerApiVersion,
  TopologyDescriptionChangedEvent,
  ObjectId,
} = require("mongodb");

const cors = require("cors");
require("dotenv").config();
const jwt = require("jsonwebtoken");
const verify = require("jsonwebtoken/verify");
const multer = require("multer");

// All Middleware
app.use(express.json());
app.use(cors());

const path = require("path");
app.use("/assets", express.static(path.join(__dirname, "assets")));

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.trnyuya.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverApi: ServerApiVersion.v1,
});

// Img upload middleware
const imageFilter = (req, file, cb) => {
  // filter image file
  //check file type is image
  if (file.mimetype.includes("image/png")) {
    // if image file
    cb(null, true);
  } else if (file.mimetype.includes("image/jpeg")) {
    // if image file
    cb(null, true);
  } else if (file.mimetype.includes("image/jpg")) {
    // if image file
    cb(null, true);
  } else {
    cb("Please upload only jpg, png or jpeg image.", false);
  }
};

var storage = multer.diskStorage({
  // multer storage
  destination: (req, file, cb) => {
    cb(null, "./assets" + "/"); // upload file to backend/
  },
  filename: (req, file, cb) => {
    // rename file
    const ext = file.mimetype.split("/")[1];
    const filename = Date.now() + "." + ext;
    req.filename = filename;
    cb(null, filename);
  },
});
var uploadFile = multer({ storage: storage, fileFilter: imageFilter });

// TO VERIFY TOKEN
function verifyJWT(req, res, next) {
  const authHeader = req.headers?.authorization;
  if (!authHeader) {
    return res.status(401).send({ message: "unauthorized", success: false });
  }
  const accessToken = authHeader.split(" ")[1];
  verify(accessToken, process.env.JWT_SECRET_TOKEN, (err, decoded) => {
    if (err) {
      return res
        .status(403)
        .send({ message: "forbidden access", success: false });
    }
    if (decoded.uid !== req.headers.uid) {
      return res
        .status(403)
        .send({ message: "forbidden access", success: false });
    }
    req.decoded = decoded;
    next();
  });
}

async function run() {
  try {
    // Connecting with mongodb
    await client.connect();

    // Collections
    const userCollection = client
      .db("annoor-business")
      .collection("users-collection");

    const productCollection = client
      .db("annoor-business")
      .collection("product-collection");

    const orderCollection = client
      .db("annoor-business")
      .collection("order-collection");

    app.get("/", async (req, res) => {
      res.send("Hello there!");
    });

    // Verify admin
    async function verifyAdmin(req, res, next) {
      const uid = req?.decoded?.uid;
      const filter = { uid };
      const user = await userCollection.findOne(filter);
      const role = user?.role;
      if (role === "admin") {
        next();
      } else {
        return res
          .status(403)
          .send({ message: "forbidden access", success: false });
      }
    }

    // -------------- USER ROUTES -------------

    // Get token/user creation
    app.put("/token", async (req, res) => {
      try {
        const userInfo = req.body;
        const doc = {
          $set: userInfo,
        };
        const uid = userInfo.uid;
        const option = {
          upsert: true,
        };
        const result = await userCollection.updateOne({ uid }, doc, option);
        const accessToken = jwt.sign({ uid }, process.env.JWT_SECRET_TOKEN, {
          expiresIn: "1d",
        });
        res
          .status(200)
          .send({ data: accessToken, success: true, message: "Got token" });
      } catch (error) {
        res
          .status(500)
          .send({ message: "Internal server error.", success: false });
      }
    });

    // Get user info
    app.get("/user", verifyJWT, async (req, res) => {
      try {
        const uid = req.headers.uid;
        const filter = { uid };
        const user = await userCollection.findOne(filter);
        res
          .status(200)
          .send({ data: user, success: true, message: "Got user info" });
      } catch (error) {
        res
          .status(500)
          .send({ success: false, message: "Internal server error." });
      }
    });

    // Update user profile
    app.post("/update-user-info", verifyJWT, async (req, res) => {
      try {
        const uid = req.headers.uid;
        const updatedInfo = req.body;
        const filter = { uid };
        const option = {
          upsert: true,
        };
        const doc = {
          $set: updatedInfo,
        };
        const result = await userCollection.updateOne(filter, doc, option);
        res.status(200).send({ message: "Profile updated.", success: true });
      } catch (error) {
        res
          .status(500)
          .send({ message: "Internal server error.", success: false });
      }
    });

    // Get products by category
    app.get("/product", async (req, res) => {
      try {
        const category = req.headers?.category;
        const filter = { category: category };
        const result = await productCollection.find(filter).toArray();
        res.status(200).send({
          data: result,
          success: true,
          message: "Got products data.",
        });
      } catch (error) {
        res.status(500).send({
          message: "Internal server error.",
          success: false,
        });
      }
    });

    // Search products
    app.get("/products", async (req, res) => {
      try {
        const query = req?.query?.search;
        const filter = { $text: { $search: `/${query}/i` } };
        console.log(filter);
        const result = await productCollection.find(filter).toArray();
        res.status(200).send({
          message: "Searched products.",
          success: true,
          data: result,
        });
      } catch (error) {
        res
          .status(500)
          .send({ message: "Internal server error.", success: false });
      }
    });

    // Order APIs
    app.post("/order", verifyJWT, async (req, res) => {
      try {
        const ordersCount = await orderCollection.estimatedDocumentCount();
        const order = req.body;
        order.orderId = ordersCount + 1;
        const result = await orderCollection.insertOne(order);
        res
          .status(200)
          .send({ success: true, message: "Order placed successfully" });
      } catch (error) {
        res
          .status(500)
          .send({ success: false, message: "Internal server error" });
      }
    });

    // Get orders by uid
    app.get("/orders", verifyJWT, async (req, res) => {
      try {
        const filter = { uid: req.headers.uid };
        const page = parseInt(req?.query?.page) - 1;
        const orderCount = await orderCollection.countDocuments(filter);
        const result = await orderCollection
          .find(filter)
          .sort({ $natural: -1 })
          .skip(page * 15)
          .limit(15)
          .toArray();

        res.status(200).send({
          success: true,
          message: "Got all orders",
          data: result,
          orderCount: orderCount,
        });
      } catch (error) {
        res
          .status(500)
          .send({ success: false, message: "Internal server error" });
      }
    });

    app.delete("/delete-order", verifyJWT, verifyAdmin, async (req, res) => {
      try {
        const orderId = Number(req.headers.id);
        const filter = { orderId: orderId };
        const result = await orderCollection.deleteOne(filter);
        res
          .status(200)
          .send({ message: "Deleted the product.", success: true });
      } catch (error) {
        res
          .status(500)
          .send({ message: "Internal server error.", success: false });
      }
    });

    // Get all orders for admin
    app.get("/all-orders", verifyJWT, verifyAdmin, async (req, res) => {
      try {
        const page = parseInt(req?.query?.page) - 1;
        const filterBy = req?.query?.filter;
        let query = {};

        if (filterBy) {
          query = { status: filterBy };
        }

        const orderCount = await orderCollection.countDocuments();
        const result = await orderCollection
          .find(query)
          .sort({ $natural: -1 })
          .skip(page * 15)
          .limit(15)
          .toArray();
        res.status(200).send({
          success: true,
          message: "Got all orders",
          data: result,
          orderCount: orderCount,
        });
      } catch (error) {
        res
          .status(500)
          .send({ success: false, message: "Internal server error" });
      }
    });

    // Make a payment
    app.post("/payment", verifyJWT, async (req, res) => {
      try {
        const paymentInfo = req.body;
        const orderId = Number(req.headers.id);
        const filter = { orderId };
        const doc = {
          $set: paymentInfo,
        };
        const result = await orderCollection.updateOne(filter, doc);
        res.status(200).send({
          message: "Successfully requested for payment.",
          success: true,
        });
      } catch (error) {
        res
          .status(500)
          .send({ success: false, message: "Internal server error" });
      }
    });

    // ------------- ADMIN ROUTES ---------------

    // Add Product
    app.post(
      "/product",
      verifyJWT,
      verifyAdmin,
      uploadFile.single("image"),
      async (req, res) => {
        try {
          let path =
            "https://annoor-server-production-af32.up.railway.app/assets/" +
            req.filename;
          const product = req.body;

          const productInfo = {
            name: product.name,
            category: product.category,
            subtext: product.subtext,
            stock: Number(product.stock),
            description: product.description,
            price: Number(product.price),
            discount: Number(product.discount),
            image: path,
          };

          const result = await productCollection.insertOne(productInfo);
          res.status(200).send({ message: "Product added.", success: true });
        } catch (error) {
          res
            .status(500)
            .send({ path, message: "Internal server error.", success: false });
        }
      }
    );

    // Edit Product
    app.post(
      "/edit-product",
      verifyJWT,
      verifyAdmin,
      uploadFile.single("image"),
      async (req, res) => {
        try {
          const filter = { _id: ObjectId(req.headers._id) };
          const product = req.body;
          let productInfo = {
            name: product.name,
            category: product.category,
            subtext: product.subtext,
            stock: Number(product.stock),
            description: product.description,
            price: Number(product.price),
            discount: Number(product.discount),
          };

          if (req?.filename) {
            let path =
              "https://annoor-server-production-af32.up.railway.app/assets/" +
              req.filename;
            productInfo = { ...productInfo, image: path };
          }

          const doc = {
            $set: productInfo,
          };

          const result = await productCollection.updateOne(filter, doc);
          res
            .status(200)
            .send({ message: "Updated the product.", success: true });
        } catch (error) {
          res
            .status(500)
            .send({ message: "Internal server error.", success: false });
        }
      }
    );

    // Get all products / search products for admin
    app.get("/all-products", verifyJWT, verifyAdmin, async (req, res) => {
      // const result = await productCollection.createIndex({
      //   name: "text",
      //   description: "text",
      //   category: "text",
      // });
      // console.log(result);

      try {
        const page = parseInt(req?.query?.page) - 1;
        const search = req?.query?.search;
        const filterBy = req?.query?.filter;

        let query = {};
        let sort = { $natural: -1 };
        let products;
        let productCount;
        if (search !== "") {
          query = {
            $text: { $search: `/${search}/i` },
          };
          sort = {};
        }

        if (filterBy === "Stock out") {
          query = { stock: 0 };
        }
        if (filterBy === "Discounted") {
          query = { discount: { $gt: 0 } };
        }

        productCount = await productCollection.countDocuments(query);
        products = await productCollection
          .find(query)
          .sort(sort)
          .skip(page * 15)
          .limit(15)
          .toArray();

        res.status(200).send({
          success: true,
          message: "Got all products",
          data: products,
          productCount: productCount,
        });
      } catch (error) {
        res.status(500).send({
          success: false,
          message: "Internal server error.",
        });
      }
    });

    // Delete a product
    app.delete("/delete-product", verifyJWT, verifyAdmin, async (req, res) => {
      try {
        const filter = { _id: ObjectId(req.headers._id) };
        const result = await productCollection.deleteOne(filter);
        res.status(200).send({ success: true, message: "Product deleted." });
      } catch (error) {
        res
          .status(500)
          .send({ success: false, message: "Internal server error." });
      }
    });

    // Get product by id
    app.get("/single-product", verifyJWT, verifyAdmin, async (req, res) => {
      try {
        const filter = { _id: ObjectId(req.headers._id) };
        const result = await productCollection.findOne(filter);
        res
          .status(200)
          .send({ success: true, message: "Got single product", data: result });
      } catch (error) {
        res
          .status(500)
          .send({ success: false, message: "Internal server error." });
      }
    });

    // Update order status
    app.post("/order-status", verifyJWT, verifyAdmin, async (req, res) => {
      try {
        const orderId = Number(req.headers.id);
        const filter = { orderId: orderId };
        const updatedOrderStatus = req.body;
        const doc = {
          $set: updatedOrderStatus,
        };
        const result = await orderCollection.updateOne(filter, doc);
        res.status(200).send({
          success: true,
          message: "Updated order status.",
        });
      } catch (error) {
        res
          .status(500)
          .send({ success: false, message: "Internal server error." });
      }
    });

    // Get all users / search users
    app.get("/all-users", verifyJWT, verifyAdmin, async (req, res) => {
      // const result = await userCollection.createIndex({
      //   email: "text",
      //   phoneNumber: "text",
      // });
      // console.log(result);

      try {
        const page = parseInt(req?.query?.page) - 1;
        const search = req?.query?.search;
        const filterBy = req?.query?.filter;
        let query = {};
        let sort = { $natural: -1 };
        let users;
        let userCount;
        if (search !== "") {
          query = {
            $text: { $search: `/${search}/i` },
          };
          sort = {};
        }
        if (filterBy === "Admin") {
          query = { role: "admin" };
        }
        userCount = await userCollection.countDocuments(query);
        users = await userCollection
          .find(query)
          .sort(sort)
          .skip(page * 15)
          .limit(15)
          .toArray();
        res.status(200).send({
          success: true,
          message: "Got all users",
          data: users,
          userCount: userCount,
        });
      } catch (error) {
        res.status(500).send({
          success: false,
          message: "Internal server error.",
        });
      }
    });

    // Make admin
    app.patch("/make-admin", verifyJWT, verifyAdmin, async (req, res) => {
      try {
        const filter = { uid: req?.headers?.id };
        const doc = {
          $set: { role: "admin" },
        };
        const result = await userCollection.updateOne(filter, doc);
        res
          .status(200)
          .send({ message: "Made admin successfully.", success: true });
      } catch (error) {
        res
          .status(500)
          .send({ message: "Internal server error.", success: false });
      }
    });

    // Remove admin
    app.patch("/remove-admin", verifyJWT, verifyAdmin, async (req, res) => {
      try {
        const filter = { uid: req?.headers?.id };
        const doc = {
          $set: { role: "" },
        };
        const result = await userCollection.updateOne(filter, doc);
        res
          .status(200)
          .send({ message: "Remove admin successfully.", success: true });
      } catch (error) {
        res
          .status(500)
          .send({ message: "Internal server error.", success: false });
      }
    });
  } finally {
    // await client.close();
  }
}
run().catch(console.dir);

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => console.log(`Responding to ${PORT}`));

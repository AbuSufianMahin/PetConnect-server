require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();
const port = process.env.PORT || 3000;
const { MongoClient, ServerApiVersion } = require('mongodb');

// Middleware
app.use(cors());
app.use(express.json());


app.get('/', (req, res) => {
  res.send('Hello World!')
})

const uri = `mongodb+srv://${process.env.PETCONNET_USER}:${process.env.PETCONNET_PASSWORD}@cluster0.udgfocl.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {

    await client.connect();

    const db = client.db("PetConnect");

    const usersCollection = db.collection("users");
    const petsCollection = db.collection("pets");

    app.post("/users", async (req, res) => {
      const userData = req.body;

      try {
        const existingUser = await usersCollection.findOne({ email: userData.email });
        if (existingUser) {
          return res.send({ message: "User with this email already exists" });
          // 
          // return;
        }

        // If not exists, insert the new user
        const result = await usersCollection.insertOne(userData);

        res.status(201).json({
          message: "User saved successfully",
          insertedId: result.insertedId,
        });
      } catch (err) {
        res.status(500).json({ message: "Database error", error: err.message });
      }
    });


    app.post("/add-pet", async (req, res) => {
      const petInfo = req.body;

      try {
        const result = await petsCollection.insertOne(petInfo);
        res.status(201).json({
          message: "Pet added successfully",
          insertedId: result.insertedId,
        });
      } catch (error) {
        res.status(500).json({ message: "Internal server error" });
      }

    })

    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  }
  finally { }
}
run().catch(console.dir);


app.listen(port, () => {
  console.log(`PetConnect is listening to port ${port}`)
})
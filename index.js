require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();
const port = process.env.PORT || 3000;
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');

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
          return res.send({ isDuplicate: true, message: "User with this email already exists" });
        }

        // If not exists, insert the new user
        const result = await usersCollection.insertOne(userData);

        res.status(201).json({
          isDuplicate: false,
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

    app.get('/my-added-pets', async (req, res) => {
      try {
        const email = req.query.email;

        if (!email) {
          return res.status(400).json({ message: "Email query parameter is required" });
        }

        const userPets = await petsCollection.find({ ownerEmail: email }).toArray();
        res.status(200).json(userPets);
      } catch (error) {

        res.status(500).json({ message: "Internal server error" });
      }
    });

    app.get('/pet-requests/incoming', async (req, res) => {
      const email = req.query.email;

      if (!email) {
        return res.status(400).json({ success: false, message: 'Email is required' });
      }

      try {
        const allRequestedOrAccepted = await petsCollection.find({
          ownerEmail : email,
          adoption_status: { $in: ["requested", "adopted"] }
        }).toArray();

        // Separate them by status
        // const requested = [];
        // const accepted = [];

        // allRequestedOrAccepted.forEach(pet => {
        //   if (pet.adoption_status === "requested") {
        //     requested.push(pet);
        //   } else if (pet.adoption_status === "adopted") {
        //     accepted.push(pet);
        //   }
        // });

        res.status(200).json(allRequestedOrAccepted);
        
      } catch (error) {
        res.status(500).json({
          success: false,
          message: 'Failed to fetch pet adoption requests',
          error: error.message
        });
      }

    })


    app.get('/pet-requests/outgoing', async (req, res) => {
      const email = req.query.email;

      if (!email) {
        return res.status(400).json({ success: false, message: 'Email is required' });
      }

      try {
        const requestedPets = await petsCollection.find({
          "requesterDetails.email": email
        }).toArray();

        res.status(200).json(requestedPets);
      } catch (error) {
        res.status(500).json({
          success: false,
          message: 'Failed to fetch requested pets',
          error: error.message
        });
      }
    })


    app.patch("/pet/:petId", async (req, res) => {
      const petId = req.params.petId;

      const newPetData = req.body;
      const query = { _id: new ObjectId(petId) };

      try {
        const result = await petsCollection.updateOne(query, {
          $set: newPetData
        })

        res.status(200).json({ message: 'Pet updated successfully', modifiedCount: result.modifiedCount });
      }
      catch (error) {
        res.status(500).json({ message: 'Internal Server Problem', error: error.message });
      }


    })

    app.get("/pets", async (req, res) => {
      try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 6;
        const category = req.query.category;
        const name = req.query.seachByName;
        const skip = (page - 1) * limit;

        // Filter only pets not adopted
        let query = { adoption_status: "not_adopted" };

        if (category && category !== "All") {
          query.petCategory = category;
        }
        if (name) {
          query.petName = { $regex: name, $options: "i" }
        }


        const total = await petsCollection.countDocuments(query);

        const pets = await petsCollection
          .find(query)
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .toArray();

        const hasMore = page * limit < total;
        res.json({ pets, hasMore });
      }
      catch (error) {
        res.status(500).json({ message: "Server error" });
      }

      app.get("/pet-details", async (req, res) => {
        const petId = req.query.petId;

        try {
          const pet = await petsCollection.findOne({ _id: new ObjectId(petId) });

          if (!pet) {
            return res.status(404).json({ error: "Pet not found" });
          }

          res.status(200).json(pet);
        } catch (error) {
          console.error("Error fetching pet:", error);
          res.status(500).json({ error: "Server error" });
        }
      })

    })


    // pet adoption request => update pet adoption_status + save requester Informations

    app.patch('/pets/:petId/request-adoption', async (req, res) => {
      const petId = req.params.petId;

      try {
        const { adoption_status, requesterName, requesterEmail, requesterContactNumber, requesterAddress } = req.body;

        const requesterInfo = {
          name: requesterName,
          email: requesterEmail,
          contactNumber: requesterContactNumber,
          address: requesterAddress,
        };

        // Update the pet document
        const queryWithPetId = { _id: new ObjectId(petId) }
        const petUpdateResult = await petsCollection.updateOne(queryWithPetId,
          {
            $set: {
              adoption_status,
              requested_at: new Date().toISOString(),
              requesterDetails: requesterInfo,
            },
          }
        );

        return res.status(200).json(petUpdateResult);

      } catch (error) {
        res.status(500).json({ message: "Server error." });

      }
    })


    app.delete('/pets/:id', async (req, res) => {
      const petId = req.params.id;

      try {
        const result = await petsCollection.deleteOne({ _id: new ObjectId(petId) });

        res.status(200).json({ deletedCount: result.deletedCount, message: 'Pet deleted successfully' });
      }
      catch (error) {

        res.status(500).json({ success: false, message: 'Internal server error' });
      }
    });


    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  }
  finally { }
}
run().catch(console.dir);


app.listen(port, () => {
  console.log(`PetConnect is listening to port ${port}`)
})
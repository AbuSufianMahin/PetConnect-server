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

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);


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
    const campaignsCollection = db.collection("campaigns");
    const donationsCollection = db.collection("donations");

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


    app.post('/create-campaign', async (req, res) => {
      try {
        const campaignData = req.body;

        const result = await campaignsCollection.insertOne(campaignData);

        res.status(201).json({ insertedId: result.insertedId, message: 'Campaign created successfully' });

      } catch (error) {
        res.status(500).json({ message: 'Server error' });
      }
    });

    app.get('/donation-campaigns', async (req, res) => {
      try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 6;
        const skip = (page - 1) * limit;

        const filter = { status: 'active' }
        const totalCount = await campaignsCollection.countDocuments(filter);


        // Fetch campaigns with pagination, sorted by date (desc)
        const campaigns = await campaignsCollection.find(filter)
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .toArray();

        const hasMore = page * limit < totalCount;
        res.json({ campaigns, hasMore });



      } catch (error) {
        res.status(500).json({ error: 'Something went wrong while fetching donation campaigns.' });
      }
    })


    app.get("/campaign-details/:id", async (req, res) => {
      try {
        const { id } = req.params;

        // Ensure valid ObjectId
        if (!ObjectId.isValid(id)) {
          return res.status(400).json({ message: "Invalid campaign ID" });
        }

        const campaign = await campaignsCollection.findOne({ _id: new ObjectId(id) });

        if (!campaign) {
          return res.status(404).json({ message: "Campaign not found" });
        }

        res.json(campaign);
      } catch (err) {
        res.status(500).json({ message: "Server error" });
      }
    });


    app.get("/my-campaigns", async (req, res) => {
      try {
        const userEmail = req.query.email;

        if (!userEmail) {
          return res.status(400).json({ error: "Email query parameter is required." });
        }

        const campaigns = await campaignsCollection
          .find({ organizerEmail: userEmail })
          .sort({ createdAt: -1 }) // Optional: show latest first
          .toArray();

        res.status(200).json(campaigns);
      } catch (error) {
        res.status(500).json({ error: "Internal server error." });
      }
    })

    app.patch("/donation-campaigns/:id/toggle-status", async (req, res) => {
      try {
        const campaignId = req.params.id;
        const { status } = req.body;

        const result = await campaignsCollection.updateOne(
          { _id: new ObjectId(campaignId) },
          { $set: { status: status } }
        );

        if (result.matchedCount === 0) {
          return res.status(404).json({ success: false, message: "Campaign not found" });
        }

        res.json({ success: true, message: `Campaign ${status === 'paused' ? 'paused' : 'resumed'} successfully` });
      } catch (error) {
        res.status(500).json({ message: "Internal server error" });
      }
    });


    app.get('/search-users', async (req, res) => {
      const searchValue = req.query.searchValue;

      try {
        let query = {};
        if (searchValue) {
          query = {
            $or: [
              { email: { $regex: searchValue, $options: 'i' } },
              { name: { $regex: searchValue, $options: 'i' } },
            ],
          };
        }
        const users = await usersCollection.find(query).toArray();
        res.send(users);
      } catch (error) {
        res.status(500).send({ message: 'Failed to fetch users', error });
      }
    });

    app.get("/users/role", async (req, res) => {
      try {
        const userEmail = req.query.email;

        if (!userEmail) {
          return res.status(400).json({ error: "User email not found in token." });
        }

        const user = await usersCollection.findOne({ email: userEmail });
        if (!user) {
          return res.status(404).json({ error: "User not found." });
        }

        return res.json({ role: user.role || "user" });


      } catch (error) {
        res.status(500).json({ error: "Internal server error." });
      }
    });

    app.patch('/users/update-role', async (req, res) => {
      const { email: userEmail, role } = req.query;
      const { adminEmail } = req.body;

      try {
        const filter = { email: userEmail };
        const updateDoc = {
          $set: {
            role,
            role_updated_at: new Date().toISOString(),
            role_updated_by: adminEmail
          }
        };

        const result = await usersCollection.updateOne(filter, updateDoc);
        res.send(result);

      } catch (error) {
        res.status(500).send({ message: 'Failed to promote user', error });
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
          ownerEmail: email,
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


    app.patch('/pets/:id/reject-request', async (req, res) => {
      const petId = req.params.id;

      try {
        const result = await petsCollection.updateOne(
          { _id: new ObjectId(petId) },
          {
            $set: { adoption_status: "not_adopted" },
            $unset: {
              requesterDetails: "",
              requested_at: ""
            }
          }
        );

        if (result.modifiedCount > 0) {
          res.status(200).json({ success: true, message: "Adoption request rejected successfully." });
        } else {
          res.status(404).json({ success: false, message: "Pet not found or no request to reject." });
        }
      } catch (error) {
        res.status(500).json({
          success: false,
          message: "Internal server error",
          error: error.message
        });
      }
    });


    app.patch('/adoptions/cancel/:petId', async (req, res) => {
      const petId = req.params.petId;

      try {
        const query = { _id: new ObjectId(petId) };

        const updateDoc = {
          $set: { adoption_status: "not_adopted" },
          $unset: {
            requesterDetails: "",
            requested_at: ""
          }
        }
        const result = await petsCollection.updateOne(query, updateDoc);


        if (result.modifiedCount > 0) {
          res.status(200).json({ success: true, message: "Adoption request canceled successfully." });
        } else {
          res.status(404).json({ success: false, message: "Pet not found or no request to cancel" });
        }
      } catch (error) {
        res.status(500).json({
          success: false,
          message: "Internal server error",
          error: error.message
        });
      }
    })


    app.patch('/pets/:id/accept-request', async (req, res) => {
      const petId = req.params.id;

      try {
        const result = await petsCollection.updateOne(
          { _id: new ObjectId(petId) },
          {
            $set: {
              adoption_status: 'adopted',
              adopted_at: new Date().toISOString(),
            },
          }
        );


        res.status(200).json({
          success: true,
          message: 'Adoption request accepted successfully.',
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          message: 'Internal server error',
          error: error.message,
        });
      }
    });

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




    app.post('/create-payment-intent', async (req, res) => {
      try {
        const amountInCents = parseFloat(req.body.amount) * 100;

        const paymentIntent = await stripe.paymentIntents.create({
          amount: amountInCents,
          currency: 'usd',
          automatic_payment_methods: { enabled: true },
        });

        res.json({ clientSecret: paymentIntent.client_secret });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    app.post('/donations', async (req, res) => {
      try {
        const { userEmail, amount, campaignId, transactionId, donatedAt } = req.body;

        // Prepare donation document
        const donationDoc = {
          userEmail,
          amount: parseFloat(amount),
          campaignId,
          transactionId: transactionId || null,
          donatedAt,
        };

        // Insert donation record
        const insertResult = await donationsCollection.insertOne(donationDoc);

        // Get current campaign info
        const campaignObjectId = new ObjectId(campaignId);

        const campaign = await campaignsCollection.findOne({ _id: campaignObjectId });

        const newDonatedAmount = (campaign.donatedAmount) + donationDoc.amount;

        // Build update operators separately
        const updateQuery = {
          $set: {
            donatedAmount: newDonatedAmount,
          },
          $push: {
            donators: {
              userEmail,
              amount: donationDoc.amount,
              donatedAt,
            },
          },
        };

        if (newDonatedAmount >= campaign.maxDonationAmount) {
          updateQuery.$set.status = "completed";
        }

        // Perform update
        await campaignsCollection.updateOne({ _id: campaignObjectId }, updateQuery);

        res.status(201).json({
          message: "Donation recorded and campaign updated.",
          donationId: insertResult.insertedId,
        });
      } catch (error) {
        res.status(500).json({ error: "Internal server error." });
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
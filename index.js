const express = require('express')
const app = express()
require('dotenv').config()
const cors = require('cors')
const cookieParser = require('cookie-parser')
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb')
const jwt = require('jsonwebtoken')
const port = process.env.PORT || 5000;
const stripe = require('stripe')(process.env.STRIPE_SK);

// middleware 
const corsOptions = {
    origin: ['http://localhost:5173', 'http://localhost:5174', 'https://diagnostic-center-1ba53.web.app'],
    credentials: true,
}
app.use(cors(corsOptions))
app.use(express.json())
app.use(cookieParser())

const verifyToken = async (req, res, next) => {
    const token = req.cookies?.token
    if (!token) {
        return res.status(401).send({ message: 'unauthorized access' })
    }
    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
        if (err) {
            return res.status(401).send({ message: 'unauthorized access' })
        }
        req.user = decoded
        next()
    })
}


// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(process.env.DB_URI, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

async function run() {
    try {
        // Connect the client to the server	(optional starting in v4.7)
        // await client.connect();
        const usersCollection = client.db('diagonsticCenter').collection('users')
        const bannersCollection = client.db('diagonsticCenter').collection('banners')
        const testsCollection = client.db('diagonsticCenter').collection('tests')
        const appointmentsCollection = client.db('diagonsticCenter').collection('appointments')
        const districtsCollection = client.db('diagonsticCenter').collection('districts')
        const upazillasCollection = client.db('diagonsticCenter').collection('upazillas')
        const recommendationsCollection = client.db('diagonsticCenter').collection('recommendations')


        //verify admin
        const verifyAdmin = async (req, res, next) => {
            const user = req.user
            const query = { email: user?.email }
            const result = await usersCollection.findOne(query)
            if (!result || result?.role !== 'admin')
                return res.status(401).send({ message: 'unauthorized access' })
            next()
        }


        //auth related api call
        app.post('/jwt', async (req, res) => {
            const { email } = req.body
            const token = jwt.sign(email, process.env.ACCESS_TOKEN_SECRET, {
                expiresIn: '10d',
            })
            res
                .cookie('token', token, {
                    httpOnly: true,
                    secure: true,
                    sameSite: 'none'
                })
                .send({ success: true })
        })
        // Logout
        app.get('/logout', async (req, res) => {
            try {
                res
                    .clearCookie('token', {
                        maxAge: 0,
                        secure: false,
                        // sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
                    })
                    .send({ success: true })
                console.log('Logout successful')
            } catch (err) {
                res.status(500).send(err)
            }
        })
        //saving user data
        app.put('/users/:email', async (req, res) => {
            const email = req.params.email
            const user = req.body
            console.log(user)
            const query = { email: email }
            const options = { upsert: true }
            const isExist = await usersCollection.findOne(query)
            if (isExist) {
                if (user?.status === 'Requested') {
                    const result = await usersCollection.updateOne(
                        query,
                        {
                            $set: user,
                        },
                        options
                    )
                    return res.send(result)
                } else {
                    return res.send(isExist)
                }
            }
            const result = await usersCollection.updateOne(
                query,
                {
                    $set: { ...user },
                },
                options
            )
            res.send(result)
        })
        //get all users
        app.get('/users', verifyToken, verifyAdmin, async (req, res) => {
            const result = await usersCollection.find().toArray();
            res.send(result);
        })
        //get single user
        app.get('/users/:email', async (req, res) => {
            const email = req.params.email;
            let query = {}
            if (email) {
                query.email = email
            }
            const result = await usersCollection.findOne(query);
            res.send(result);
        })
        //update user info
        app.put('/users/update/:id', verifyToken, async (req, res) => {
            const id = req.params.id;
            const user = req.body;
            const query = { _id: new ObjectId(id) };
            const options = { upsert: true };
            const updatedDoc = {
                $set: {
                    name: user?.name,
                    blood: user?.blood,
                    district: user?.district,
                    upazilla: user?.upazilla
                }
            }
            const result = await usersCollection.updateOne(query, updatedDoc, options);
            res.send(result);
        })

        //update user status 
        app.patch('/user/status/:id', verifyToken, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const status = req.body.status
            const filter = { _id: new ObjectId(id) };
            const updatedDoc = {
                $set: {
                    status: status,
                }
            }
            const result = await usersCollection.updateOne(filter, updatedDoc);
            res.send(result);
        })

        //update user role
        app.patch('/user/role/:id', verifyToken, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const role = req.body.role;
            const filter = { _id: new ObjectId(id) };
            const updatedDoc = {
                $set: {
                    role: role,
                }
            }
            const result = await usersCollection.updateOne(filter, updatedDoc);
            res.send(result);
        })



        //upload banner image
        app.post('/banners', verifyToken, verifyAdmin, async (req, res) => {
            const banner = req.body;
            const result = await bannersCollection.insertOne(banner);
            res.send(result);
        })
        //update isActive value;
        app.patch('/banners/:id', verifyToken, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const status = req.body.isActive;
            const deactivateOtherBannersFilter = {
                _id: { $ne: new ObjectId(id) } // Exclude the banner being updated
            };
            const deactivateOtherBannersUpdate = {
                $set: {
                    isActive: false
                }
            };
            await bannersCollection.updateMany(deactivateOtherBannersFilter, deactivateOtherBannersUpdate);

            const filter = { _id: new ObjectId(id) };
            const updatedDoc = {
                $set: {
                    isActive: status,
                }
            }
            const result = await bannersCollection.updateOne(filter, updatedDoc);
            res.send(result);
        })
        //get all banners
        app.get('/banners', async (req, res) => {
            const result = await bannersCollection.find().toArray();
            res.send(result);
        })

        //delete banenr
        app.delete('/banners/:id', verifyToken, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const result = await bannersCollection.deleteOne(query);
            res.send(result);
        })

        //add test 
        app.post('/tests', verifyToken, verifyAdmin, async (req, res) => {
            const test = req.body;
            const result = await testsCollection.insertOne(test);
            res.send(result);
        })

        //get all test
        app.get('/tests', async (req, res) => {
            try {
                const page = req.query?.page;
                const size = parseInt(req.query?.size);
                const sortObj = req.query.sort;
                const sortField = { booked: sortObj }
                const count = await testsCollection.estimatedDocumentCount()
                const result = await testsCollection.find().skip(page * size).limit(size).sort(sortField).toArray();
                res.send({ result, count });
            } catch (error) {
                console.error(error);
                res.status(500).send('Internal Server Error');
            }
        })

        //delete a single test
        app.delete('/tests/:id', verifyToken, verifyAdmin, async (req, res) => {
            try {
                const id = req.params.id;
                const query = { _id: new ObjectId(id) };
                const result = await testsCollection.deleteOne(query);
                res.send(result)
            } catch (error) {
                res.send({ message: error.message })
            }
        })

        //get single test details 
        app.get('/tests/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const result = await testsCollection.findOne(query);
            res.send(result);
        })

        //update a single test data 
        app.put('/test/update/:id', verifyToken, verifyAdmin, async (req, res) => {
            try {
                const id = req.params.id;
                const test = req.body;
                const filter = { _id: new ObjectId(id) };
                const options = { upsert: true };
                const updatedDoc = {
                    $set: {
                        title: test.title,
                        image: test?.image,
                        details: test?.details,
                        date: test?.date,
                        price: test?.price,
                        slots: test?.slots
                    }
                }
                const result = await testsCollection.updateOne(filter, updatedDoc, options);
                res.send(result)
            } catch (error) {
                res.send({ message: error.message })
            }
        })

        //create payment intent
        app.post('/create-payment-intent', verifyToken, async (req, res) => {
            try {
                const { price } = req.body
                const amount = parseInt(price * 100)
                if (!price || amount < 1) return
                const { client_secret } = await stripe.paymentIntents.create({
                    amount: amount,
                    currency: 'usd',
                    payment_method_types: ['card'],
                })
                res.send({ clientSecret: client_secret })
            } catch (error) {
                res.send({ message: error.message })
            }
        })
        //save test booking in db
        app.post('/appointments', async (req, res) => {
            const appoinment = req.body;
            const result = await appointmentsCollection.insertOne(appoinment);
            res.send(result);
        })

        //update rooms booking status;
        app.patch('/test/slots/:id', verifyToken, async (req, res) => {
            try {
                const id = req.params.id;
                const filter = { _id: new ObjectId(id) };
                const result = await testsCollection.updateOne(
                    filter,
                    { $inc: { slots: -1, booked: 1 } }
                );
                res.send(result)
            } catch (error) {
                res.status(500).send({ message: 'Internal Server Error' });
            }

        })

        //get appointment info for specific user
        app.get('/appointments/:email', async (req, res) => {
            const email = req.params.email;
            const query = { 'user.email': email };
            const result = await appointmentsCollection.find(query).toArray();
            res.send(result)
        })

        //cancel appointnments
        app.delete('/appointments/delete/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const result = await appointmentsCollection.deleteOne(query);
            res.send(result)
        })

        //find reservation
        app.get('/reservation/:id', async (req, res) => {
            const id = req.params.id;
            const filter = req.query;

            const query = {
                testId: id,
                'user.email': { $regex: filter.search, $options: 'i' }
            };
            const result = await appointmentsCollection.find(query).toArray();
            res.send(result);

        })

        //update test status 
        app.patch('/reservation/result/:id', async (req, res) => {
            const id = req.params.id;
            const testResult = req.body.testResult;
            const query = { _id: new ObjectId(id) };
            const updatedDoc = {
                $set: {
                    status: 'delivered',
                    testResult
                }
            };
            const result = await appointmentsCollection.updateOne(query, updatedDoc);
            res.send(result);
        })


        //get the all districts and upazillas 
        app.get('/location', async (req, res) => {
            const upazillas = await upazillasCollection.find().toArray()
            const districts = await districtsCollection.find().toArray();
            res.send({ upazillas, districts });
        })


        //get all health recommandetaions
        app.get('/recommendations', async (req, res) => {
            const result = await recommendationsCollection.find().toArray();
            res.send(result);
        })

        // Send a ping to confirm a successful connection
        await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}
run().catch(console.dir);


app.get('/health', (req, res) => {
    res.send('Hello from Diagonstic Server..')
})

app.listen(port, () => {
    console.log(`Diagonstic is running on port ${port}`)
})

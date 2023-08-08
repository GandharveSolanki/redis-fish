import express from "express";
import axios from "axios";
import { createClient } from 'redis';

const app = express();
const port = process.env.PORT || 3000;

// Use the Redis client configuration provided by the cloud service
const redisClient = createClient({
    password: 'swUkW8EvYdWXLPTY7ke8FbBr0ywqSiFb',
    socket: {
        host: 'redis-16490.c15.us-east-1-4.ec2.cloud.redislabs.com',
        port: 16490
    }
});

redisClient.on("error", (error) => console.error(`Error : ${error}`));

// Move the async function inside the app.listen callback
app.listen(port, async () => {
  console.log(`App listening on port ${port}`);
  
  // Your Redis client is available here, so perform any necessary setup
  try {
    await redisClient.connect();
  } catch (error) {
    console.error("Error connecting to Redis:", error);
  }
});

async function fetchApiData(species) {
  const apiResponse = await axios.get(
    `https://www.fishwatch.gov/api/species/${species}`,
    {
      headers: {
        Authorization: `Bearer ${redisClient.get("authToken")}`,
      },
    }
  );
  console.log("Request sent to the API");
  return apiResponse.data;
}

async function cacheData(req, res, next) {
  const species = req.params.species;
  let results;
  try {
    const cacheResults = await redisClient.get(species);
    if (cacheResults) {
      results = JSON.parse(cacheResults);
      res.send({
        fromCache: true,
        data: results,
      });
    } else {
      next();
    }
  } catch (error) {
    console.error(error);
    res.status(404);
  }
}

async function getSpeciesData(req, res) {
  const species = req.params.species;
  let results;

  try {
    results = await fetchApiData(species);
    if (results.length === 0) {
      throw "API returned an empty array";
    }
    await redisClient.set(species, JSON.stringify(results), {
      EX: 180,
      NX: true,
      password: 'swUkW8EvYdWXLPTY7ke8FbBr0ywqSiFb',
    });

    res.send({
      fromCache: false,
      data: results,
    });
  } catch (error) {
    console.error(error);
    res.status(404).send("Data unavailable");
  }
}

app.get("/fish/:species", cacheData, getSpeciesData);

app.listen(port, () => {
  console.log(`App listening on port ${port}`);
});

#!/usr/bin/env node
"use strict";

import Fastify from 'fastify';
import { fetchImageAndHandle } from './request1.js'; // Adjust the path as needed

const app = Fastify({ logger: true });

// Route to handle image compression requests
app.get('/', async (req, reply) => {
  await fetchImageAndHandle(req, reply);
});


export default app;

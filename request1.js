//import Fastify from 'fastify';
import fetch from 'node-fetch';
import sharp from 'sharp';



// Constants
const MIN_COMPRESS_LENGTH = 1024;
const MIN_TRANSPARENT_COMPRESS_LENGTH = MIN_COMPRESS_LENGTH * 100;
const DEFAULT_QUALITY = 80;
const MAX_HEIGHT = 16383; // Resize if height exceeds this value

// Utility function to determine if compression is needed
function shouldCompress(req) {
  const { originType, originSize, webp } = req.params;

  return originType.startsWith('image') &&
         originSize > 0 &&
         !req.headers.range &&
         !(webp && originSize < MIN_COMPRESS_LENGTH) &&
         !(!webp && (originType.endsWith('png') || originType.endsWith('gif')) && originSize < MIN_TRANSPARENT_COMPRESS_LENGTH);
}

// Function to compress an image buffer directly
async function compress(req, reply, buffer) {
  sharp.cache(false);
  sharp.simd(true);
  const format = 'jpeg';
  const sharpInstance = sharp(buffer, { unlimited: true, animated: false, limitInputPixels: false });

  // Set headers for the compressed image
  reply.header('Content-Type', `image/${format}`);
  reply.header('X-Original-Size', req.params.originSize);

  try {
    // Convert the buffer to the desired format
    const compressedBuffer = await sharpInstance
      .toFormat(format, { quality: req.params.quality, effort: 0 })
      .toBuffer();

    // Set the processed size headers
    reply.header('X-Processed-Size', compressedBuffer.length);
    reply.header('X-Bytes-Saved', req.params.originSize - compressedBuffer.length);

    // Send the compressed buffer as the response
    reply.send(compressedBuffer);
  } catch (err) {
    console.error('Error processing image:', err.message);
    reply.status(500).send('Failed to process image.');
  }
}

// Function to handle image compression requests
export async function fetchImageAndHandle(req, reply) {
  const url = req.query.url;
  if (!url) {
    return reply.status(400).send('Image URL is required.');
  }

  req.params = {
    url: decodeURIComponent(url),
    webp: !req.query.jpeg,
    grayscale: req.query.bw != 0,
    quality: parseInt(req.query.l, 10) || DEFAULT_QUALITY,
  };

  try {
    // Fetch the image using node-fetch
    const response = await fetch(req.params.url);

    if (!response.ok) {
      return reply.status(response.status).send('Failed to fetch the image.');
    }

    // Extract headers
    req.params.originType = response.headers.get('content-type');
    req.params.originSize = parseInt(response.headers.get('content-length'), 10) || 0;

    // Read the image into a buffer
    const buffer = await response.buffer();

    if (shouldCompress(req)) {
      // Compress the buffer
      await compress(req, reply, buffer);
    } else {
      // Send the original buffer as the response if compression is not needed
      reply.header('Content-Type', req.params.originType);
      reply.header('Content-Length', req.params.originSize);
      reply.send(buffer);
    }
  } catch (error) {
    console.error('Error fetching image:', error.message);
    reply.status(500).send('Failed to fetch the image.');
  }
}

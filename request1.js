import axios from 'axios';
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

// Function to compress an image stream directly
export async function compress(req, reply, inputStream) {
  sharp.cache(false);
  sharp.simd(true);
  const format = 'jpeg';
  const sharpInstance = sharp({ unlimited: true, animated: false, limitInputPixels: false });

  // Set headers for the compressed image
  reply.header('Content-Type', `image/${format}`);
  reply.header('X-Original-Size', req.params.originSize);

  try {
    // Create a transform stream to handle the output
    const transformStream = sharpInstance
      .toFormat(format, { quality: req.params.quality, effort: 0 });

    // Convert the stream to a buffer
    const buffer = await transformStream.toBuffer();

    // Set the processed size headers
    reply.header('X-Processed-Size', buffer.length);
    reply.header('X-Bytes-Saved', req.params.originSize - buffer.length);

    // Send the buffer as the response
    reply.send(buffer);
  } catch (err) {
    console.error('Error processing image:', err.message);
    reply.status(500).send('Failed to process image.');
  }
}

// Function to handle image compression requests
async function fetchImageAndHandle(req, reply) {
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
    // Fetch the image using axios
    const response = await axios({
      method: 'get',
      url: req.params.url,
      responseType: 'stream'
    });

    if (response.status !== 200) {
      return reply.status(response.status).send('Failed to fetch the image.');
    }

    // Extract headers
    req.params.originType = response.headers['content-type'];
    req.params.originSize = parseInt(response.headers['content-length'], 10) || 0;

    if (shouldCompress(req)) {
      // Compress the stream
      await compress(req, reply, response.data);
    } else {
      // Stream the original image to the response if compression is not needed
      reply.header('Content-Type', req.params.originType);
      reply.header('Content-Length', req.params.originSize);
      reply.send(response.data);
    }
  } catch (error) {
    console.error('Error fetching image:', error.message);
    reply.status(500).send('Failed to fetch the image.');
  }
}

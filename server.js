// This code was developed with assistance from OpenAI's ChatGPT.

const express = require('express');
const multer = require('multer');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const pythonExecutable = process.env.PYTHON_EXECUTABLE || "python3";

// Determine Python executable path (prefer venv if it exists)
// let pythonExecutable = 'python';
const venvPythonPath = path.join(__dirname, 'venv', process.platform === 'win32' ? 'Scripts' : 'bin', 'python' + (process.platform === 'win32' ? '.exe' : ''));
if (fs.existsSync(venvPythonPath)) {
  pythonExecutable = venvPythonPath;
  console.log(`Using Python from venv: ${pythonExecutable}`);
} else {
  console.log(`Using system Python: ${pythonExecutable}`);
  console.log('Note: Make sure transformers, torch, and pillow are installed');
}

// multer for memory storage (we'll pass the buffer to Python)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    // Accept only image files
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed!'), false);
    }
  }
});

// POST endpoint for image classification
app.post('/classify', upload.single('image'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No image file provided' });
  }

  // Create a temporary file to pass to Python script
  const tempFilePath = path.join(__dirname, 'temp_image_' + Date.now() + '.jpg');

  // Write the buffer to a temporary file
  fs.writeFileSync(tempFilePath, req.file.buffer);

  // Get the model path (current directory)
  const modelPath = __dirname;

  // Spawn Python process to run inference (using the Python executable determined at startup)
  const pythonProcess = spawn(pythonExecutable, ['inference.py', tempFilePath, modelPath]);

  let output = '';
  let errorOutput = '';

  pythonProcess.stdout.on('data', (data) => {
    output += data.toString();
  });

  pythonProcess.stderr.on('data', (data) => {
    errorOutput += data.toString();
  });

  pythonProcess.on('close', (code) => {
    // Clean up temporary file
    fs.unlinkSync(tempFilePath);

    if (code !== 0) {
      console.error('Python script error:', errorOutput);
      return res.status(500).json({
        error: 'Classification failed',
        details: errorOutput
      });
    }

    try {
      // Parse the JSON output from Python
      const result = JSON.parse(output);
      res.json({
        label: result.label,
        probability: result.probability,
        classId: result.classId
      });
    } catch (parseError) {
      console.error('Failed to parse Python output:', output);
      res.status(500).json({
        error: 'Failed to parse classification result',
        details: output
      });
    }
  });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
  console.log(`POST an image to http://localhost:${PORT}/classify`);
});


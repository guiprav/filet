import cors from 'cors';
import express from 'express';
import fs from 'fs';
import helmet from 'helmet';
import mime from 'mime';
import multer from 'multer';
import pathUtil from 'path';
import rateLimit from 'express-rate-limit';
import { v4 as uuidGen } from 'uuid';

let app = express();
let port = process.env.PORT || 3000;
let trustProxy = JSON.parse(process.env.TRUST_PROXY || '0');
let rateLimitWindow = JSON.parse(process.env.RATE_LIMIT_WINDOW || '60000');
let rateLimitMaxReqs = JSON.parse(process.env.RATE_LIMIT_MAX_REQS || '20');
let storagePath = process.env.STORAGE_PATH || `${process.cwd()}/storage`;

if (trustProxy) {
  app.enable('trust proxy');
}

app.use(rateLimit({
  windowMs: rateLimitWindow,
  max: rateLimitMaxReqs,
}));

app.use(helmet({ frameguard: false }));
app.use(cors());

app.use((req, res, next) => {
  let url = new URL(`http://unused/${req.originalUrl}`);
  let path = decodeURIComponent(url.pathname).slice(1);

  console.log(req.method, path, JSON.stringify({
    ip: req.ip,
    method: req.method,
    path,
    query: req.query,
  }));

  next();
});

app.get('/status', (req, res) => res.send('OK'));

let upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      let path = `${storagePath}/${req.params.ns}`;

      fs.mkdir(path, { recursive: true }, err => {
        if (err) {
          return cb(err);
        }

        cb(null, path);
      });
    },

    filename: (req, file, cb) => {
      file.uuid = uuidGen();
      cb(null, file.uuid);
    },
  }),
});

app.post('/:ns/upload', upload.single('file'), (req, res) => {
  let { ns } = req.params;
  let { file } = req;

  let path = `/${ns}/${file.uuid}/${file.originalname}`;
  let url = `${req.protocol}://${req.get('Host')}${path}`;

  console.log('Upload complete:', path, JSON.stringify({
    ip: req.ip,
    uuid: file.uuid,
    originalName: file.originalname,
    url,
  }));

  res.send({ uuid: file.uuid, url });
});

app.get('/:ns/:uuid', (req, res) => {
  let { ns, uuid } = req.params;
  res.sendFile(`${storagePath}/${ns}/${uuid}`);
});

app.get('/:ns/:uuid/:slug', (req, res) => {
  let { ns, uuid, slug } = req.params;

  let type = mime.lookup(slug);
  let charset = mime.charsets.lookup(type);
  let contentType = `${type}${charset ? `; charset=${charset}` : ''}`;

  res.sendFile(`${storagePath}/${ns}/${uuid}`, {
    headers: { 'Content-Type': contentType },
  });
});

app.listen(port);
console.log(`Listening on port :${port}...`);

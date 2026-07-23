# Tourism App Backend

Node.js backend server for the Tourism app. It provides user authentication and user management APIs with MongoDB as the database.

On startup, the backend creates the tourism collections listed below if they do not already exist:

- `users`
- `hotels`
- `guides`
- `bookings`
- `destinations`
- `reviews`
- `crowdData`
- `transport`
- `weather`
- `emergencyAlerts`
- `businessListings`
- `payments`

## Features

- User signup and login
- JWT-style auth token response
- MongoDB user storage
- Password hashing with Node.js `crypto.scryptSync`
- CORS support for mobile and web clients
- User list, detail, update, and delete routes

## Tech Stack

- Node.js
- Native HTTP server
- MongoDB Node.js driver

## Project Structure

```text
Backend/
  controllers/
    user.controller.js
  models/
    user.model.js
  routes/
    user.route.js
  index.js
  package.json
```

## Environment Variables

Create a `.env` file inside `Backend/` or in the project root.

```env
MONGODB_URI=your_mongodb_connection_string
MONGODB_DB_NAME=tourism_app
PORT=4002
HOST=0.0.0.0
JWT_SECRET=your_secret_key
CORS_ORIGIN=*
REQUEST_BODY_LIMIT_BYTES=1048576
MONGODB_DNS_SERVERS=1.1.1.1,8.8.8.8
MONGODB_SERVER_SELECTION_TIMEOUT_MS=10000
```

Required:

- `MONGODB_URI`: MongoDB connection string

For the Atlas URI supplied for this project, replace `<db_password>` locally with the database user's password and put the resulting value in `Backend/.env`. Do not commit that file.

Optional:

- `MONGODB_DB_NAME`: Database name, default is `tourism_app`
- `PORT`: Server port, default is `3001`
- `HOST`: Server host, default is `0.0.0.0`
- `JWT_SECRET`: Secret used to sign auth tokens
- `CORS_ORIGIN`: Allowed frontend origin, default is `*`
- `REQUEST_BODY_LIMIT_BYTES`: JSON request body limit, default is `1048576`
- `MONGODB_DNS_SERVERS`: Comma-separated DNS servers if MongoDB DNS resolution needs custom servers. This environment uses `1.1.1.1,8.8.8.8` because the default Node.js resolver refuses Atlas SRV lookups.
- `MONGODB_SERVER_SELECTION_TIMEOUT_MS`: Maximum time to wait for MongoDB server selection, default is `10000`.

You can copy `.env.example` and fill in real values.

## Install Dependencies

```bash
npm install
```

## Run Server

```bash
npm start
```

After starting, the server prints the local URL:

```text
Server is running on http://localhost:<PORT>
MongoDB connected successfully
```

To test only the MongoDB Atlas connection without starting the HTTP server:

```bash
npm run check:mongodb
```

## Render Deployment

This repository includes a Render Blueprint at `render.yaml`. It deploys the backend as a Node web service from the `Backend/` folder.

If you deploy from the Render dashboard instead of the Blueprint, use these settings:

```text
Root Directory: Backend
Build Command: npm ci
Start Command: npm start
Node Version: >=20.19.0
Health Check Path: /health
```

Set these environment variables in Render. Do not commit real secret values:

```env
MONGODB_URI=mongodb+srv://tourism_org:<db_password>@cluster0.jkfay0r.mongodb.net/?appName=Cluster0
MONGODB_DB_NAME=tourism_app
JWT_SECRET=use-a-long-random-secret
CORS_ORIGIN=https://your-frontend-domain.com
REQUEST_BODY_LIMIT_BYTES=1048576
MONGODB_SERVER_SELECTION_TIMEOUT_MS=10000
```

Render provides the `PORT` environment variable automatically. The backend already listens on `process.env.PORT` and binds to `0.0.0.0`, which Render requires for web services.

For local testing, `CORS_ORIGIN=*` is fine. For production, set it to your real frontend URL. Leave `MONGODB_DNS_SERVERS` unset on Render unless the deploy logs show an Atlas SRV DNS error.

Deployment health check URL:

```http
GET /health
GET /healthz
GET /api/health
```

## API Routes

### Health Check

```http
GET /
GET /health
GET /healthz
GET /api/health
```

### Signup

```http
POST /api/user/signup
POST /api/users/signup
POST /api/user/register
POST /api/users/register
POST /api/user
POST /api/users
```

Request body:

```json
{
  "name": "pankaj",
  "email": "pankajk@gmail.com",
  "password": "123456"
}
```

### Login

```http
POST /api/user/login
POST /api/users/login
POST /api/user/signin
POST /api/users/signin
```

Request body:

```json
{
  "email": "pankajk@gmail.com",
  "password": "123456"
}
```

Success response:

```json
{
  "success": true,
  "message": "Welcome back, pankaj",
  "token": "jwt-style-token",
  "user": {
    "id": "user_id",
    "name": "pankaj",
    "email": "pankajk@gmail.com"
  }
}
```

### Get Users

```http
GET /api/users
GET /api/user
```

### Get User By ID

```http
GET /api/user/:id
GET /api/users/:id
```

### Update User

```http
PUT /api/user/:id
PATCH /api/user/:id
PUT /api/users/:id
PATCH /api/users/:id
```

Request body can include any of these fields:

```json
{
  "name": "new name",
  "email": "newemail@gmail.com",
  "password": "newpassword"
}
```

### Delete User

```http
DELETE /api/user/:id
DELETE /api/users/:id
```

## Notes

- Restart the server after changing backend files.
- Use `Content-Type: application/json` for POST, PUT, and PATCH requests.
- Passwords are stored as hashes in MongoDB.
- Do not commit real `.env` values.

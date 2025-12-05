# Architecture Documentation - QLHS (School Management System)

## 1. Tổng Quan Hệ Thống (System Overview)
QLHS là một hệ thống quản lý trường học được xây dựng trên nền tảng Node.js, cung cấp giải pháp toàn diện cho việc quản lý học sinh, lớp học, điểm danh, điểm số và học phí. Hệ thống sử dụng kiến trúc Monolithic với Server-Side Rendering (SSR) cho giao diện người dùng và RESTful API cho các tác vụ dữ liệu.

## 2. Tech Stack (Công Nghệ Sử Dụng)

### Core
- **Runtime**: Node.js
- **Framework**: Express.js
- **Language**: JavaScript (ES Modules)

### Database & Storage
- **Database**: MongoDB
- **ODM**: Mongoose
- **File Storage**: Local filesystem (via Multer)

### Frontend / View Layer
- **Templating Engine**: EJS (Embedded JavaScript)
- **Styling**: Tailwind CSS (Utility-first CSS framework)
- **Assets**: Static files served from `public` directory

### Security & Authentication
- **Authentication**: JWT (JSON Web Tokens) stored in HTTP-only cookies
- **Password Hashing**: Bcrypt
- **Security Headers**: Helmet
- **CORS**: Configured for production/development environments
- **Rate Limiting**: `express-rate-limit` (API & Auth specific limits)
- **Sanitization**: `express-mongo-sanitize`, custom input sanitization

### Utilities & Tools
- **Logging**: Winston, Morgan (Daily rotate logs)
- **Validation**: Joi, Zod
- **Job Queue**: Agenda (Background jobs)
- **Excel Processing**: XLSX
- **Email**: Nodemailer

## 3. Cấu Trúc Dự Án (Project Structure)

```
QLHS/
├── public/                 # Static assets (images, css, js)
├── server/                 # Backend application code
│   ├── src/
│   │   ├── config/         # Configuration (DB, Env, Logger)
│   │   ├── constants/      # Constant values
│   │   ├── controllers/    # Request handlers (Logic layer)
│   │   ├── jobs/           # Background jobs (Agenda definitions)
│   │   ├── middlewares/    # Custom middlewares (Auth, Upload, Error)
│   │   ├── models/         # Mongoose schemas & models
│   │   ├── routes/         # Route definitions (API & View routes)
│   │   ├── services/       # Business logic services
│   │   ├── styles/         # Source CSS (Tailwind input)
│   │   ├── utils/          # Helper functions
│   │   ├── views/          # EJS Templates
│   │   ├── index.js        # Application Entry Point
│   │   └── worker.js       # Worker process entry point
│   ├── .env                # Environment variables
│   ├── package.json        # Dependencies & Scripts
│   └── tailwind.config.js  # Tailwind configuration
└── ...
```

## 4. Các Thành Phần Chính (Key Components)

### 4.1. Server Entry Point (`src/index.js`)
- Khởi tạo Express app.
- Cấu hình Middleware: Security (Helmet, CORS), Body Parser, Cookie Parser, Logger.
- Định nghĩa Routes:
    - `/api/v1/*`: RESTful API endpoints.
    - `/`: Web routes (Render EJS views).
- Kết nối Database (MongoDB).
- Khởi động Server.

### 4.2. Authentication Flow
- Sử dụng JWT (Access Token & Refresh Token).
- Token được lưu trong HTTP-only Cookies để ngăn chặn XSS.
- Middleware `requireAuth` kiểm tra token cho các protected routes.
- Middleware `redirectIfAuthenticated` chuyển hướng người dùng đã đăng nhập khỏi trang login/register.

### 4.3. Data Flow (MVC Pattern)
1.  **Request**: Client gửi request (HTTP GET/POST/...) đến Server.
2.  **Route**: Router định tuyến request đến Controller tương ứng.
3.  **Middleware**: Các middleware (Auth, Validation, Upload) chạy trước Controller.
4.  **Controller**:
    - Xử lý logic nghiệp vụ.
    - Tương tác với **Model** để truy vấn/cập nhật Database.
    - Gọi **Service** (nếu logic phức tạp).
5.  **Response**:
    - **API**: Trả về JSON response (cho client-side JS hoặc mobile app).
    - **View**: Render **View** (EJS template) với dữ liệu và trả về HTML cho trình duyệt.

### 4.4. Background Jobs
- Sử dụng thư viện `agenda` để xử lý các tác vụ nền (background tasks) như gửi email, xử lý dữ liệu nặng, v.v.
- Worker process chạy độc lập thông qua `src/worker.js`.

## 5. Quy Trình Phát Triển & Triển Khai

### Scripts
- `npm start`: Chạy server production.
- `npm run dev`: Chạy server development (watch mode).
- `npm run worker`: Chạy worker process.
- `npm run build:css`: Build Tailwind CSS.
- `npm run watch:css`: Watch và build Tailwind CSS.

### Environment Variables
Cấu hình qua file `.env` bao gồm:
- Server Port, Host
- MongoDB Connection String
- JWT Secrets & Expiry
- Email Configuration
- Logging Levels

## 6. Ghi Chú Bảo Mật
- Hệ thống áp dụng Rate Limiting để chống Brute-force và DDoS.
- Input được sanitize để chống NoSQL Injection.
- Sử dụng Helmet để thiết lập các HTTP headers bảo mật.

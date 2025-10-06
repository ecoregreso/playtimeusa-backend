const mongoose = require('mongoose');
22
	
 
3
	
+const normalizeHost = (rawHost = '') => {
4
	
+  const trimmed = rawHost.replace(/\/+$/, '');
5
	
+
6
	
+  if (trimmed.startsWith('mongodb://')) {
7
	
+    return { protocol: 'mongodb://', host: trimmed.replace(/^mongodb:\/\//, '') };
8
	
+  }
9
	
+
10
	
+  if (trimmed.startsWith('mongodb+srv://')) {
11
	
+    return { protocol: 'mongodb+srv://', host: trimmed.replace(/^mongodb\+srv:\/\//, '') };
12
	
+  }
13
	
+
14
	
+  return { protocol: 'mongodb+srv://', host: trimmed };
15
	
+};
16
	
+
17
	
+const buildMongoUri = () => {
18
	
+  if (process.env.MONGO_URI) {
19
	
+    return process.env.MONGO_URI;
20
	
+  }
21
	
+
22
	
+  const { DB_USER, DB_PASS, DB_HOST, DB_NAME } = process.env;
23
	
+  if (!DB_HOST || !DB_NAME) {
24
	
+    return null;
25
	
+  }
26
	
+
27
	
+  const { protocol, host } = normalizeHost(DB_HOST);
28
	
+  if (host.includes('/')) {
29
	
+    throw new Error('DB_HOST should not include a path segment. Provide MONGO_URI for advanced connection strings.');
30
	
+  }
31
	
+  const credentials =
32
	
+    DB_USER && DB_PASS ? `${encodeURIComponent(DB_USER)}:${encodeURIComponent(DB_PASS)}@` : '';
33
	
+
34
	
+  return `${protocol}${credentials}${host}/${DB_NAME}?retryWrites=true&w=majority`;
35
	
+};
36
	
+
37
	
+const resolveMongoUri = () => {
38
	
+  const uri = buildMongoUri();
39
	
+
40
	
+  if (!uri) {
41
	
+    throw new Error(
42
	
+      'MongoDB connection string is not configured. Set MONGO_URI or DB_HOST/DB_NAME (with optional DB_USER/DB_PASS).'
43
	
+    );
44
	
+  }
45
	
+
46
	
+  return uri;
47
	
+};
48
	
+
349
	
 const connectDB = async () => {
50
	
+  const mongoUri = resolveMongoUri();
51
	
+
52
	
+  if (mongoose.connection.readyState === 1) {
53
	
+    return mongoose.connection;
54
	
+  }
55
	
+
456
	
   try {
5
	
-    await mongoose.connect(process.env.MONGO_URI, {
6
	
-      useNewUrlParser: true,
7
	
-      useUnifiedTopology: true,
57
	
+    const connection = await mongoose.connect(mongoUri, {
58
	
+      maxPoolSize: Number.parseInt(process.env.MONGO_MAX_POOL_SIZE || '10', 10),
+
59
	
+      serverSelectionTimeoutMS: Number.parseInt(process.env.MONGO_SERVER_SELECTION_TIMEOUT || '10000', 10)
860
	
     });
9
	
-    console.log('MongoDB connected successfully');
61
	
+
62
	
+    console.log(`MongoDB connected successfully to ${connection.connection.host}`);
63
	
+    return connection.connection;
1064
	
   } catch (error) {
1165
	
     console.error('MongoDB connection failed:', error.message);
12
	
-    process.exit(1);
66
	
+    throw error;
1367
	
   }
1468
	
 };
1569
	
 
16
	
-module.exports = connectDB;
70
	
+const disconnectDB = async () => {
71
	
+  if (mongoose.connection.readyState !== 0) {
72
	
+    await mongoose.disconnect();
73
	
+  }
74
	
+};
1775
	
 
76
	
+module.exports = { connectDB, disconnectDB };

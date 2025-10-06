+#!/usr/bin/env node
2
	
+/*
3
	
+ * Validate package.json for strict JSON compliance and stray control characters.
4
	
+ */
5
	
+const fs = require('fs');
6
	
+const path = require('path');
7
	
+
8
	
+const pkgPath = path.resolve(__dirname, '..', 'package.json');
9
	
+const raw = fs.readFileSync(pkgPath, 'utf8');
10
	
+
11
	
+const leadingControl = raw.match(/^[^\S\r\n]*([\u0000-\u001F\u007F])/);
12
	
+if (leadingControl) {
13
	
+  const charCode = leadingControl[1].codePointAt(0);
14
	
+  throw new Error(
15
	
+    `package.json contains a non-printable control character (code ${charCode}) near the top of the file. ` +
16
	
+      'Render and npm expect pure UTF-8 JSON. Remove binary/diagnostic characters before deploying.'
17
	
+  );
18
	
+}
19
	
+
20
	
+try {
21
	
+  JSON.parse(raw);
22
	
+} catch (error) {
23
	
+  error.message = `package.json failed strict JSON.parse validation: ${error.message}`;
24
	
+  throw error;
25
	
+}
26
	
+
27
	
+if (!raw.startsWith('{')) {
28
	
+  throw new Error('package.json must start with "{". Ensure no BOM or metadata is prepended.');
29
	
+}
30
	
+
31
	
+console.log('package.json passed strict validation.');

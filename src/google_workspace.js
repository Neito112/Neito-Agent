const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');

const CREDENTIALS_PATH = path.join(__dirname, '..', 'auth_gg_workspace.json');
const TOKEN_PATH = path.join(__dirname, '..', 'workspaces', 'earner', 'google_token.json');

function getClientCredentials() {
  if (fs.existsSync(CREDENTIALS_PATH)) {
    const raw = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf8'));
    return raw.installed || raw.web;
  }
  const rootCreds = 'C:\\Users\\Neito\\.gemini\\antigravity\\native_agents\\auth_gg-workspace-desktop.json';
  if (fs.existsSync(rootCreds)) {
    const raw = JSON.parse(fs.readFileSync(rootCreds, 'utf8'));
    return raw.installed || raw.web;
  }
  return null;
}

function getStoredToken() {
  if (fs.existsSync(TOKEN_PATH)) {
    try {
      return JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));
    } catch (_) {}
  }
  return null;
}

function saveToken(token) {
  const dir = path.dirname(TOKEN_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(TOKEN_PATH, JSON.stringify(token, null, 2), 'utf8');
}

async function refreshAccessToken(refreshToken, creds) {
  return new Promise((resolve, reject) => {
    const postData = new URLSearchParams({
      client_id: creds.client_id,
      client_secret: creds.client_secret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token'
    }).toString();

    const req = https.request('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postData)
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.access_token) {
            resolve(json.access_token);
          } else {
            reject(new Error(json.error_description || json.error || 'Failed to refresh token'));
          }
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

async function getValidAccessToken() {
  const creds = getClientCredentials();
  if (!creds) throw new Error('Chưa tìm thấy file cấu hình auth_gg-workspace-desktop.json');

  const token = getStoredToken();
  if (!token || !token.refresh_token) {
    return null; // Requires user consent
  }

  if (token.access_token && token.expiry_date && token.expiry_date > Date.now() + 120000) {
    return token.access_token;
  }

  const newAccessToken = await refreshAccessToken(token.refresh_token, creds);
  token.access_token = newAccessToken;
  token.expiry_date = Date.now() + 3500 * 1000;
  saveToken(token);
  return newAccessToken;
}

function getAuthUrl(port = 8085) {
  const creds = getClientCredentials();
  if (!creds) throw new Error('Thiếu cấu hình Google OAuth Client');

  const redirectUri = `http://localhost:${port}/oauth2callback`;
  const scopes = [
    'https://www.googleapis.com/auth/spreadsheets.readonly',
    'https://www.googleapis.com/auth/drive.readonly'
  ].join(' ');

  const params = new URLSearchParams({
    client_id: creds.client_id,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: scopes,
    access_type: 'offline',
    prompt: 'consent'
  });

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

async function startOAuthFlow(port = 8085) {
  const creds = getClientCredentials();
  if (!creds) throw new Error('Không tìm thấy file credentials Google Workspace');

  const redirectUri = `http://localhost:${port}/oauth2callback`;
  const authUrl = getAuthUrl(port);

  return new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      try {
        const reqUrl = new URL(req.url, `http://localhost:${port}`);
        if (reqUrl.pathname === '/oauth2callback') {
          const code = reqUrl.searchParams.get('code');
          if (!code) {
            res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end('<h1>❌ Thiếu Authorization Code từ Google</h1>');
            server.close();
            return reject(new Error('No code received'));
          }

          const postData = new URLSearchParams({
            code: code,
            client_id: creds.client_id,
            client_secret: creds.client_secret,
            redirect_uri: redirectUri,
            grant_type: 'authorization_code'
          }).toString();

          const tokenReq = https.request('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
              'Content-Length': Buffer.byteLength(postData)
            }
          }, (tokenRes) => {
            let data = '';
            tokenRes.on('data', chunk => data += chunk);
            tokenRes.on('end', () => {
              try {
                const tokenData = JSON.parse(data);
                if (tokenData.access_token) {
                  tokenData.expiry_date = Date.now() + (tokenData.expires_in || 3600) * 1000;
                  saveToken(tokenData);
                  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
                  res.end(`
                    <div style="font-family: sans-serif; text-align: center; margin-top: 50px;">
                      <h1 style="color: #10b981;">✅ KẾT NỐI GOOGLE WORKSPACE THÀNH CÔNG!</h1>
                      <p style="font-size: 18px; color: #374151;">Kim và hệ thống Antigravity Agents đã được cấp quyền đọc Google Sheets & Drive của Sếp Neito.</p>
                      <p style="color: #6b7280;">Sếp có thể đóng tab này và quay lại Discord để hỏi Kim số dư ví nhé ạ!</p>
                    </div>
                  `);
                  server.close();
                  resolve(tokenData);
                } else {
                  res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
                  res.end('<h1>❌ Lỗi lấy token: ' + JSON.stringify(tokenData) + '</h1>');
                  server.close();
                  reject(new Error(tokenData.error_description || 'Lỗi cấp token'));
                }
              } catch (e) {
                res.writeHead(500);
                res.end(e.message);
                server.close();
                reject(e);
              }
            });
          });
          tokenReq.on('error', (e) => {
            server.close();
            reject(e);
          });
          tokenReq.write(postData);
          tokenReq.end();
        }
      } catch (err) {
        server.close();
        reject(err);
      }
    });

    server.listen(port, () => {
      console.log(`[GoogleWorkspace] Local OAuth receiver listening on port ${port}`);
    });

    server.on('error', (e) => {
      reject(e);
    });
  });
}

async function fetchSheetData(spreadsheetId, range = 'A1:Z100') {
  const accessToken = await getValidAccessToken();
  if (!accessToken) {
    throw new Error('AUTH_REQUIRED');
  }

  return new Promise((resolve, reject) => {
    const encodedRange = encodeURIComponent(range);
    const apiUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodedRange}`;

    https.get(apiUrl, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'User-Agent': 'AntigravityAgent/1.0'
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.values) {
            resolve(json.values);
          } else if (json.error) {
            reject(new Error(json.error.message || 'Lỗi đọc Google Sheet'));
          } else {
            resolve([]);
          }
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

async function searchDriveSpreadsheets(query = '') {
  const accessToken = await getValidAccessToken();
  if (!accessToken) throw new Error('AUTH_REQUIRED');

  return new Promise((resolve, reject) => {
    let q = "mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false";
    if (query) {
      q += ` and name contains '${query.replace(/'/g, "\\'")}'`;
    }
    const apiUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name,webViewLink)`;

    https.get(apiUrl, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'User-Agent': 'AntigravityAgent/1.0'
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve(json.files || []);
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

module.exports = {
  getClientCredentials,
  getStoredToken,
  getValidAccessToken,
  getAuthUrl,
  startOAuthFlow,
  fetchSheetData,
  searchDriveSpreadsheets
};

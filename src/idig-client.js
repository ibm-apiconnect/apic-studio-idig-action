'use strict';
const core = require('@actions/core');
const fs = require('fs');
const path = require('path');
const https = require('https');
const FormData = require('form-data');
const AdmZip = require('adm-zip');

const outputFile = 'studioProjectFiles.zip';

let zipFolders = function(workspacePath, folders) {
    const zip = new AdmZip();
    for (const folder of folders) {
        const folderPath = path.join(workspacePath, folder);
        if (fs.existsSync(folderPath) && fs.statSync(folderPath).isDirectory()) {
            zip.addLocalFolder(folderPath, folder);
        }
    }
    const outputPath = path.join(workspacePath, outputFile);
    zip.writeZip(outputPath);
    return outputPath;
};

let publishProjects = async function(workspacePath, folders, idigHost, platformApiPrefix, nodeTlsRejectUnauthorized, authUsername, authPassword) {
    if (!authUsername || !authPassword) {
        core.setFailed('auth-username and auth-password credential values are missing.');
        return;
    }
    if (nodeTlsRejectUnauthorized) {
        process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
    }

    const zipPath = zipFolders(workspacePath, folders);
    console.log(`Zip created at: ${zipPath}`);
    const curlUrl = `https://${platformApiPrefix}.${idigHost}/idig-broker/publish`;
    const formData = new FormData();
    formData.append('project', fs.createReadStream(zipPath), {
        filename: outputFile,
        contentType: 'application/zip'
    });
    const response = await createOrUpdateProjects(curlUrl, formData, 'POST', authUsername, authPassword);
    core.info(`Response: ${JSON.stringify(response)}`);
    fs.unlink(zipPath, (err) => {
        if (err) throw err;
    });
    return response;
}

let deleteProjects = async function(workspacePath, deletedFiles, idigHost, platformApiPrefix, nodeTlsRejectUnauthorized, authUsername, authPassword) {
    if (!authUsername || !authPassword) {
        core.setFailed('auth-username and auth-password credential values are missing.');
        return;
    }
    if (nodeTlsRejectUnauthorized) {
        process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
    }

    const body = {};

    for (const deletedFile of deletedFiles) {
        const parsedContent = parseSimpleYaml(Buffer.from(deletedFile.content, 'base64').toString('utf8'));
        const kind = parsedContent.kind;
        const projectName = parsedContent.metadata?.namespace || deletedFile.path.split('/')[0];
        const assetName = parsedContent.metadata?.name;
        const assetVersion = parsedContent.metadata?.version;

        if (!assetName || !assetVersion) {
            continue;
        }

        if (!body[projectName]) {
            body[projectName] = { mcpServers: [], llms: [] };
        }

        const assetId = `${assetName}:${assetVersion}`;

        if (kind === 'MCPServer') {
            body[projectName].mcpServers.push(assetId);
        }

        if (kind === 'LLM') {
            body[projectName].llms.push(assetId);
        }
    }

    const curlUrl = `https://${platformApiPrefix}.${idigHost}/idig-broker/published-assets`;
    return deletePublishedAssets(curlUrl, body, authUsername, authPassword);
}

let createOrUpdateProjects = function(curlUrl, formData, method, authUsername, authPassword) {
    return new Promise((resolve) => {
        const url = new URL(curlUrl);
        const extraHeaders = { Accept: 'application/json' };
        if (authUsername && authPassword) {
            extraHeaders['Authorization'] = 'Basic ' + Buffer.from(`${authUsername}:${authPassword}`).toString('base64');
        }
        const headers = formData.getHeaders(extraHeaders);
        const options = {
            hostname: url.hostname,
            port: url.port || 443,
            path: url.pathname,
            method: 'POST',
            headers
        };
        const request = https.request(options, (response) => {
            let body = '';
            response.on('data', (chunk) => { body += chunk; });
            response.on('end', () => {
                let data;
                try { data = JSON.parse(body); } catch { data = body; }
                if (response.statusCode === 200 || response.statusCode === 201) {
                    resolve({ status: response.statusCode, message: [ `${method} operation has been successful` ], data });
                } else {
                    const message = data?.message || [ body ];
                    resolve({ status: response.statusCode, message, data });
                }
            });
        });
        request.on('error', (err) => {
            resolve({ status: 500, message: [ err.message ] });
        });
        formData.pipe(request);
    });
};

let parseSimpleYaml = function(content) {
    const result = {};
    let section = null;

    for (const line of content.split('\n')) {
        if (!line.trim()) {
            continue;
        }

        if (!line.startsWith(' ')) {
            const [key, ...rest] = line.split(':');
            result[key.trim()] = rest.join(':').trim().replace(/^"|"$/g, '');
            section = key.trim();
            continue;
        }

        if (line.startsWith('  ') && !line.startsWith('    ') && section) {
            const trimmedLine = line.trim();
            const [key, ...rest] = trimmedLine.split(':');
            if (!result[section] || typeof result[section] !== 'object') {
                result[section] = {};
            }
            result[section][key.trim()] = rest.join(':').trim().replace(/^"|"$/g, '');
        }
    }

    return result;
};

let deletePublishedAssets = function(curlUrl, body, authUsername, authPassword) {
    return new Promise((resolve) => {
        const url = new URL(curlUrl);
        const requestBody = JSON.stringify(body);
        const headers = {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(requestBody)
        };
        if (authUsername && authPassword) {
            headers['Authorization'] = 'Basic ' + Buffer.from(`${authUsername}:${authPassword}`).toString('base64');
        }
        const options = {
            hostname: url.hostname,
            port: url.port || 443,
            path: url.pathname,
            method: 'DELETE',
            headers
        };
        const request = https.request(options, (response) => {
            let responseBody = '';
            response.on('data', (chunk) => { responseBody += chunk; });
            response.on('end', () => {
                let data;
                try { data = JSON.parse(responseBody); } catch { data = responseBody; }
                if (response.statusCode === 200 || response.statusCode === 201) {
                    resolve({ status: response.statusCode, message: [ 'DELETE operation has been successful' ], data });
                } else {
                    const message = data?.message || [ responseBody ];
                    resolve({ status: response.statusCode, message, data });
                }
            });
        });
        request.on('error', (err) => {
            resolve({ status: 500, message: [ err.message ] });
        });
        request.write(requestBody);
        request.end();
    });
};

module.exports = { publishProjects, deleteProjects }

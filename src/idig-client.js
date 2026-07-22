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

let publishProjects = async function(workspacePath, folders, idigHost, platformApiPrefix, nodeTlsRejectUnauthorized) {
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
    const response = await createOrUpdateProjects(curlUrl, formData, 'POST');
    core.info(`Response: ${JSON.stringify(response)}`);
    fs.unlink(zipPath, (err) => {
        if (err) throw err;
    });
    return response;
}

let deleteProjects = async function(workspacePath, idigHost, platformApiPrefix, nodeTlsRejectUnauthorized) {
    if (nodeTlsRejectUnauthorized) {
        process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
    }
    
    return null;
}

let createOrUpdateProjects = function(curlUrl, formData, method) {
    return new Promise((resolve) => {
        const url = new URL(curlUrl);
        const headers = formData.getHeaders({ Accept: 'application/json' });
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

module.exports = { publishProjects, deleteProjects }

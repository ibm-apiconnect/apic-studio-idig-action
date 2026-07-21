'use strict';
const fs = require('fs');
const path = require('path');
const dns = require('dns');
const FormData = require('form-data');
const axios = require('axios');
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
    console.log(`Zip created at: ${zipPath} (${fs.statSync(zipPath).size} bytes)`);
    let curlUrl = `https://${platformApiPrefix}.${idigHost}/idig-broker/publish`;
    const zipSize = fs.statSync(zipPath).size;
    const formData = new FormData();
    formData.append('zip', fs.createReadStream(zipPath), {
        filename: outputFile,
        contentType: 'application/zip',
        knownLength: zipSize
    });
    const contentLength = await new Promise((resolve, reject) => formData.getLength((err, len) => err ? reject(err) : resolve(len)));
    const resp = await createOrUpdateProjects(curlUrl, formData, 'POST', formData.getHeaders()['content-type'], contentLength);
    fs.unlink(zipPath, (err) => {
        if (err) throw err;
    });
    return resp;
}

let deleteProjects = async function(workspacePath, idigHost, platformApiPrefix, nodeTlsRejectUnauthorized) {
    if (nodeTlsRejectUnauthorized) {
        process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
    }
    
    return null;
}

let createOrUpdateProjects = async function(curlUrl, bodyContent, method, contentType, contentLength) {
    console.log('createOrUpdateProjects');
    const hostname = new URL(curlUrl).hostname;
    await new Promise(resolve => dns.lookup(hostname, (err, address) => {
        if (err) console.log(`DNS lookup failed for ${hostname}: ${err.message}`);
        else console.log(`DNS resolved ${hostname} -> ${address}`);
        resolve();
    }));
    try {
        const resp = await axios.post(curlUrl, bodyContent, {
            maxContentLength: Infinity,
            maxBodyLength: Infinity,
            headers: {
                Accept: 'application/json',
                'Content-Type': contentType,
                'Content-Length': contentLength
            }
        })
        .then(function(res) {
            if (res.status === 201 || res.status === 200) {
                return { status: res.status, message: [ `${method} operation has been successful` ] };
            }
            return res.json();
        });
        return resp;
    } catch (err) {
        const status = err.response?.status || 500;
        const message = err.response?.data?.message || [ err.message || String(err) ];
        console.log(`Error status: ${status}, message: ${JSON.stringify(message)}`);
        return { status, message };
    }
};

module.exports = { publishProjects, deleteProjects }

'use strict';
const fs = require('fs');
const path = require('path');
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
    console.log(`Zip created at: ${zipPath}`);
    let curlUrl = `https://${platformApiPrefix}.${idigHost}/idig-broker/publish`;
    const formData = new FormData();
    formData.append('zipFile', fs.readFileSync(zipPath), {
        filename: outputFile,
        contentType: 'application/zip'
    });
    const resp = await createOrUpdateProjects(curlUrl, formData, 'POST');
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

let createOrUpdateProjects = async function(curlUrl, bodyContent, method) {
    console.log('createOrUpdateProjects');
    try {
        const res = await axios.post(curlUrl, bodyContent, {
            headers: {
                Accept: 'application/json'
            }
        });
        if (res.status === 201 || res.status === 200) {
            return { status: res.status, message: [ `${method} operation has been successful` ] };
        }
        return res.data;
    } catch (err) {
        const status = err.response?.status || 500;
        const message = err.response?.data?.message || [ err.message || String(err) ];
        console.log(`Error status: ${status}, message: ${JSON.stringify(message)}`);
        return { status, message };
    }
};

module.exports = { publishProjects, deleteProjects }

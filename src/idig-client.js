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
    let curlUrl = `https://${platformApiPrefix}.${idigHost}/idig-broker/publish`;
    const formData = new FormData();
    formData.append('zip', fs.createReadStream(zipPath), {
        name: outputFile,
        contentType: 'application/zip'
    });
    const resp = await createOrUpdateProjects(curlUrl, formData, 'POST', formData.getHeaders()['content-type']);
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

let createOrUpdateProjects = async function(curlUrl, bodyContent, method, contentType) {
    console.log('createOrUpdateProjects');
    try {
        const resp = await axios.post(curlUrl, bodyContent, {
            timeout: 30000,
            headers: {
                Accept: 'application/json',
                'Content-Type': contentType,
                ...bodyContent.getHeaders?.()
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
        console.log(err);
        return { status: 500, message: [ err.message || String(err) ] };
    }
};

module.exports = { publishProjects, deleteProjects }

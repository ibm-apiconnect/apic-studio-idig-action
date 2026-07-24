'use strict';
const core = require('@actions/core');
const { publishProjects, deleteProjects } = require('./idig-client');

async function run() {
   try {
    const workspacePath = process.env['GITHUB_WORKSPACE'];
    const idigHost = core.getInput('idig_host');
    const filesChanged = core.getInput('changed_files');
    const deletedFilesContent = core.getInput('deleted_files_content');
    const platformIdigPrefix = core.getInput('platform_idig_prefix') ? core.getInput('platform_idig_prefix') : 'idig-broker';
    const nodeTlsRejectUnauthorized = (core.getInput('insecure_skip_tls_verify').toLowerCase() === 'true');
    
    const changedFolders = filesChanged.trim()
      ? [...new Set(filesChanged.trim().split(/\s+/).map(f => f.split('/')[0]))]
      : [];
    const deletedFiles = deletedFilesContent.trim() ? JSON.parse(deletedFilesContent) : [];
    
    if (changedFolders.length !== 0 || deletedFiles.length !== 0) {
        await execution(idigHost, platformIdigPrefix, workspacePath, changedFolders, deletedFiles, nodeTlsRejectUnauthorized);
    } else {
        core.setOutput('action-result', 'No files changed from the previous commit to publish to IDIG Broker');
    }
  } catch (err) {
    core.setFailed(err.message);
  }
}

async function execution(idigHost, platformIdigPrefix, workspacePath, changedFolders, deletedFiles, nodeTlsRejectUnauthorized) {
    try {
        core.info(`IDIG Host ${idigHost}`);
        const responses = [];

        if (changedFolders.length !== 0) {
            const publishResponse = await publishProjects(workspacePath, changedFolders, idigHost, platformIdigPrefix, nodeTlsRejectUnauthorized);
            core.info(`publish response: ${JSON.stringify(publishResponse)}`);
            responses.push({ publishedProjects: publishResponse });

            if (![ 200, 201, 304 ].includes(publishResponse.status)) {
                const errMsg = Array.isArray(publishResponse.message) ? publishResponse.message[0] : JSON.stringify(publishResponse);
                core.setOutput('action-result', JSON.stringify(responses));
                core.setFailed(errMsg);
                return;
            }
        }

        if (deletedFiles.length !== 0) {
            const deleteResponse = await deleteProjects(workspacePath, deletedFiles, idigHost, platformIdigPrefix, nodeTlsRejectUnauthorized);
            core.info(`delete response: ${JSON.stringify(deleteResponse)}`);
            responses.push({ deletedProjects: deleteResponse });

            if (![ 200, 201, 304 ].includes(deleteResponse.status)) {
                const errMsg = Array.isArray(deleteResponse.message) ? deleteResponse.message[0] : JSON.stringify(deleteResponse);
                core.setOutput('action-result', JSON.stringify(responses));
                core.setFailed(errMsg);
                return;
            }
        }

        core.setOutput('action-result', JSON.stringify(responses));
    } catch (error) {
        core.setFailed(error.message);
    }
}

run();
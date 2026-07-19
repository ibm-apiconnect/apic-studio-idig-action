'use strict';
const core = require('@actions/core');
const { publishProjects, deleteProjects } = require('./idig-client');

async function run() {
   try {
    const workspacePath = process.env['GITHUB_WORKSPACE'];
    const idigHost = core.getInput('idig_host');
    const filesChanged = core.getInput('changed_files');
    const platformIdigPrefix = core.getInput('platform_idig_prefix') ? core.getInput('platform_idig_prefix') : 'idig';
    const nodeTlsRejectUnauthorized = (core.getInput('insecure_skip_tls_verify').toLowerCase() === 'true');
    
    const changedFolders = filesChanged.trim()
      ? [...new Set(filesChanged.trim().split(/\s+/).map(f => f.split('/')[0]))]
      : [];
    
    if (changedFolders.length !== 0) {
        await execution(workspacePath, changedFolders, idigHost, platformIdigPrefix, nodeTlsRejectUnauthorized);
    } else {
        core.setOutput('action-result', 'No files changed from the previous commit to send to Discovery Service');
    }
  } catch (err) {
    core.setFailed(err.message);
  }
}

async function execution(idigHost, platformIdigPrefix, workspacePath, githubServer, repoLocation, nodeTlsRejectUnauthorized) {
    try {
        core.info(`IDIG Host ${idigHost}`);
        const resp = await publishProjects(workspacePath, changedFolders, idigHost, platformIdigPrefix, nodeTlsRejectUnauthorized);
        core.info(`response: status: ${resp.status}, message: ${resp.message[0]}`);

        core.setOutput('action-result', `response: status: ${resp.status}, message: ${resp.message[0]}`);

        if (![ 200, 201, 304 ].includes(resp.status)) {
            core.setFailed(resp.message[0]);
        }
    } catch (error) {
        core.setFailed(error.message);
    }
}

run();
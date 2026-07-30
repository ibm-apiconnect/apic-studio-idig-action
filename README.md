# Create an APIConnect IDIG Broker Action

The APIConnect IDIG Broker Action allows you to publish your API studio created files from your own repository. Any projects that are removed from your repository are automatically deleted from the IDIG broker.

# Usage

See [action.yml](action.yml)

## Parameters required for apic-studio-idig-action

The following parameters are always required:

- IDIG_HOST - Domain name of the API Connect IDIG instance where API Studio files will be published and deleted.<br /> &nbsp; Example : `us-east.apiconnect.automation.ibm.com`
- PLATFORM_IDIG_PREFIX - The Platform IDIG prefix has a default value of `idig-broker`. It can be changed to match your system setup if it is different from the default.
- CHANGED_FILES - Files changed between current and previous commit.
- DELETED_FILES_CONTENT - Deleted files and their content from previous commit.
- INSECURE_SKIP_TLS_VERIFY - If set to true the action skips the validity check for the server's certificate. This may be required in the case where your APIConnect system is using self-signed certificates. Note: Setting this will make your HTTPS connections insecure.
- AUTH_USERNAME - The username value obtained from the Github Action created secret `IDIG_USERNAME`. For more information on secret creation see [here](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets#creating-encrypted-secrets-for-a-repository). For the sample below the username secret should be called `IDIG_USERNAME` as it will need to match the following templated value ${{ secrets.IDIG_USERNAME }}.
- AUTH_PASSWORD - The password value obtained from the Github Action created secret `IDIG_PASSWORD`. For more information on secret creation see [here](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets#creating-encrypted-secrets-for-a-repository). For the sample below the password secret should be called `IDIG_PASSWORD` as it will need to match the following templated value ${{ secrets.IDIG_PASSWORD }}.

**Important**  
The secrets can be obtained from the list of secrets in your openshift cluster. The secret should be present in the same namespace as your IDIG broker deployment. The username and password data as part of the secret should be decoded first from base64 before adding them to your Github action repository such as the `apic-studio-idig-test` repository as seen [here](https://github.com/ibm-apiconnect/apic-studio-idig-test)

To create the workflow action in your GitHub repository do the following
1. Create a .github/workflows directory in your repository on GitHub if this directory does not already exist.
2. In the .github/workflows directory, create a file named **idig-publish.yml**.
3. Copy the yaml contents of the example described below into the idig-publish.yml file.
4. Update the env variables to match your environment.

```
name: Publish API Studio changes to IDIG

on:
  push:
    branches:
      - main
      - master
      
env: 
  IDIG_BROKER_HOST: <host-name>
  PLATFORM_IDIG_PREFIX: <platform-idig-prefix>

jobs:
  discover-changes:
    name: Discover changed files and deleted asset definitions
    runs-on: ubuntu-latest
    outputs:
      changed_files: ${{ steps.difference.outputs.changed_files }}
      deleted_files_content: ${{ steps.difference.outputs.deleted_files_content }}
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4
        with:
          fetch-depth: 2   # need HEAD and HEAD~1 for the diff

      - name: Collect changed files and deleted file contents from previous commit
        id: difference
        run: |
          files=$(git diff --name-only HEAD~1 HEAD)
          deleted_files=$(git diff --diff-filter=D --name-only HEAD~1 HEAD)
          deleted_files_content='[]'

          if [ -n "$deleted_files" ]; then
            deleted_files_content=$(
              echo "$deleted_files" | while IFS= read -r file; do
                [ -n "$file" ] || continue
                content=$(git show "HEAD~1:$file" | base64 | tr -d '\n')
                printf '{"path":"%s","content":"%s"}\n' "$file" "$content"
              done | jq -R -s 'split("\n") | map(select(length > 0) | fromjson)'
            )
          fi

          files_oneline=$(echo "$files" | tr '\n' ' ' | sed 's/[[:space:]]*$//')
          echo "Changed files in this push: $files_oneline"
          echo "changed_files=$files_oneline" >> "$GITHUB_OUTPUT"
          echo "deleted_files_content<<EOF" >> "$GITHUB_OUTPUT"
          echo "$deleted_files_content" >> "$GITHUB_OUTPUT"
          echo "EOF" >> "$GITHUB_OUTPUT"

  publish-changes:
    name: Publish changed folders and delete removed published assets
    runs-on: ubuntu-latest
    needs: discover-changes
    steps:
      - uses: actions/checkout@v4
      - name: Set up Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '24'
      - name: Publish changed project folders and delete removed published assets
        id: publish
        uses: ibm-apiconnect/apic-studio-idig-action@main
        with:
          idig_host: ${{ env.IDIG_BROKER_HOST }}
          platform_idig_prefix: ${{ env.PLATFORM_IDIG_PREFIX }}
          changed_files: ${{ needs.discover-changes.outputs.changed_files }}
          deleted_files_content: ${{ needs.discover-changes.outputs.deleted_files_content }}
          insecure_skip_tls_verify: 'true'
          auth_username: ${{ secrets.IDIG_USERNAME }}
          auth_password: ${{ secrets.IDIG_PASSWORD }}
      - name: Display publish and delete action results
        env:
          ACTION_RESULT: ${{ steps.publish.outputs.action-result }}
        run: |
          echo "Result of the action: $ACTION_RESULT"
```

In the above yml content, env and jobs are described to publish and delete API Studio projects and their files.<br /> 
The job works as follows, on a push commit to the GitHub repo newly created or modified API Studio Projects will be published/updated on the IDIG broker. If any project is deleted as part of the same commit, the project and its file contents will be deleted on the IDIG broker as well.<br />

Please refer to [here](https://github.com/ibm-apiconnect/apic-studio-idig-test) which has a working example of a repository that you can similarly create.

## More details on setting up a sample GitHub Action
For more details on how to set up a GitHub Action workflow in your GitHub repo in general see [the quickstart guide](https://docs.github.com/en/actions/quickstart).

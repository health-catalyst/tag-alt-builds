import * as tl from 'azure-pipelines-task-lib/task';
import * as vstsInterfaces from 'azure-devops-node-api/interfaces/common/VsoBaseInterfaces';
import * as webApi from 'azure-devops-node-api/WebApi';

function completeTask(sucess: boolean, message?: any) {
    if (sucess) {
        tl.setResult(tl.TaskResult.Succeeded, message);
    } else {
        let err = message;
        if (message.message) {
            err = message.message;
        }
        tl.setResult(tl.TaskResult.Failed, err);
    }
    tl.debug("Leaving Tag Build/Release task");
}

async function run() {
    tl.debug("Starting Tag Build/Release task");

    let tpcUri = tl.getVariable("System.TeamFoundationCollectionUri");
    // try to get the build team project, in case it's different from the release team project
    let teamProject = tl.getVariable("Build.ProjectName");
    if (!teamProject || teamProject.length === 0) {
        // fall back on the release team project
        teamProject = tl.getVariable("System.TeamProject");
    }
    let type = tl.getInput("type", true);
    let tags = tl.getDelimitedInput("tags", '\n', true);

    let buildId = -1;
    let bId = tl.getInput("buildId", true);
    // just for tests
    if (bId === "-1") {
        bId = null;
    }
    if (bId) {
        buildId = parseInt(bId);
        tl.debug(`Build ID = ${buildId}`);
    } else {
        if (type === "Build") {
            return completeTask(false, "No build ID found - perhaps Type should be 'Release' not 'Build'?");
        }
    }
    
    let releaseId = -1;
    let rId = tl.getVariable("Release.ReleaseId");
    if (rId) {
        releaseId = parseInt(rId);
        tl.debug(`Release ID = ${releaseId}`);
    } else {
        if (type === "Release") {
            return completeTask(false, "No release ID found - perhaps Type should be 'Build' not 'Release'?");
        } 
    }
        
    // handle creds
    let credHandler: vstsInterfaces.IRequestHandler;
    let accessToken = tl.getVariable("System.AccessToken");
    if (!accessToken || accessToken.length === 0) {
        tl.setResult(tl.TaskResult.Failed, "Could not find token for autheniticating. For classic pipelines, please enable OAuth token in Build/Release Options. For YALM pipelines, set 'SYSTEM.ACCESSTOKEN' in the environment.");
        tl.debug("Leaving Tag Build task");
        return;
    } else {
        tl.debug("Detected token: creating bearer cred handler");
        credHandler = webApi.getBearerHandler(accessToken);
    }

    let vsts = new webApi.WebApi(tpcUri, credHandler);
    
    if (type === "Build") {
        tl.debug("Getting build api client");
        let buildApi = await vsts.getBuildApi();
        
        console.info(`Setting tags on build [${buildId}]`);
        await buildApi.addBuildTags(tags, teamProject, buildId)
            .then(tags => {
                tl.debug(`New tags: ${tags.join(',')}`);
                return completeTask(true, `Successfully added tags to the ${type}`);
            })
            .catch(e => tl.setResult(tl.TaskResult.Failed, e));
    } else {
        tl.debug("Getting release api client");

        let releaseResourceArea;
        try {
            let locationClient = await vsts.getLocationsApi();
            releaseResourceArea = await locationClient.getResourceArea("efc2f575-36ef-48e9-b672-0c6fb4a48ac5");
        } catch (e) {
            console.warn("Could not get releaseResourceArea resource area: this may cause the task to fail.");
        }
        let releaseApi = await vsts.getReleaseApi(releaseResourceArea ? releaseResourceArea.locationUrl : null);

        console.info(`Setting tags on release [${releaseId}]`);
        await releaseApi.addReleaseTags(tags, teamProject, releaseId)
            .then(tags => {
                tl.debug(`New tags: ${tags.join(',')}`);
                return completeTask(true, `Successfully added tags to the ${type}`);
            })
            .catch(e => completeTask(false, e));
    }
}

run();

export const callMsGraph = async (accessToken) => {
    var userData = {}

    // Get basic profile information
    var userDataResponse = await fetch("https://graph.microsoft.com/v1.0/me", {
        method: "GET",
        headers: {
            "Authorization": `Bearer ${accessToken}`,
            "Content-Type": "application/json"
        }
    })
    var userDataJson = await userDataResponse.json()
    userData = userDataJson

    // Get profile picture
    var userImageResponse = await fetch("https://graph.microsoft.com/v1.0/me/photo/$value", {
        method: "GET",
        headers: {
            "Authorization": `Bearer ${accessToken}`,
            "Content-Type": "application/json"
        }
    })

    if (userImageResponse.ok) {
        const photoBlob = await userImageResponse.blob();
        const photoUrl = URL.createObjectURL(photoBlob);
        userData["photo"] = photoUrl;
    } else if (userImageResponse.status === 404) {
        console.log("Profile photo not found.");
        userData["photo"] = null; // Handle the absence of a profile photo gracefully
    } else {
        console.error("Error fetching profile photo:", userImageResponse.statusText);
    }

    const groupDataResponse = await fetch("https://graph.microsoft.com/v1.0/me/appRoleAssignments", {
        method: "GET",
        headers: {
            Authorization: `Bearer ${accessToken}`
        }
    });
    if(groupDataResponse.ok){
        var groupDataJson = await groupDataResponse.json()
        console.log(groupDataJson["data"])
    }
    else{
        console.log("Error fetching Groups Data")
    }
    // console.log(userData)

    //console.log("User's groups:", result.data.value);
    // const response = await fetch("https://graph.microsoft.com/v1.0/me/memberOf", {
    // headers: {
    //     Authorization: `Bearer ${accessToken}`,
    // },
    // });
    // const data = await response.json();
    // console.log(data.value)
    
    return userData;
};


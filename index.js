const axios = require("axios");
const AWS = require('aws-sdk');

const s3 = new AWS.S3();

exports.handler = async (event) => {
    const lastSeenId = await getLastSeenId();
    console.log("Found lastSeendId: " + lastSeenId);
    
    const {
        messages,
        maxCheckinId
    } = await getUntappdCheckins(lastSeenId);
    
    if (messages.length) {
        await sendCheckinsToSlack(messages);
    }
    
    if (lastSeenId !== maxCheckinId) {
        console.log("Updating lastSeenId: " + maxCheckinId);
        await postLastSeenId(maxCheckinId);
    }
};

const getLastSeenId = async () => {
    var response = await s3.getObject({
        Bucket: "slappd",
        Key: "LastSeenId.txt"
    }, err => {
        if (err) {
            console.log("Error retrieving lastSeenId: " + err); 
        }
    }).promise();
    
    return response.Body.toString();
};

const postLastSeenId = async lastSeenId => {
    var response = await s3.putObject({
        Bucket: "slappd",
        Key: "LastSeenId.txt",
        Body: Buffer.from(lastSeenId.toString(), 'binary')
    }, err => {
        if (err) {
            console.log("Error uploading lastSeenId: " + err)
        }
    }).promise();
    
    if (typeof response.ETag === 'undefined') {
        console.log("Error updating lastSeenId: " + response);
    }
};

const getUntappdData = async lastSeenId => {
   try {
       const response = await axios.get(buildRequestUrl(lastSeenId));
       const {
           data: {
               meta: {
                   code: responseCode
               }
           }
       } = response;
       
       if (responseCode !== 200) {
           console.log("Invalid response code from Untappd: " + responseCode);
           return undefined;
       }
       
       return response.data.response;
   }  catch (e) {
       console.log("Error while attempting to get Untappd data: " + e);
   }
};

const buildRequestUrl = lastSeenId => {
    const UNTAPPD_ID = process.env.UNTAPPD_ID;
    const UNTAPPD_SECRET = process.env.UNTAPPD_SECRET;
    const UNTAPPD_TOKEN = process.env.UNTAPPD_TOKEN;
    
    return `https://api.untappd.com/v4/checkin/recent?client_id=${UNTAPPD_ID}&client_secret=${UNTAPPD_SECRET}&access_token=${UNTAPPD_TOKEN}&min_id=${lastSeenId}`;
};

const getUntappdCheckins = async lastSeenId => {
    const response = await getUntappdData(lastSeenId);
    if (typeof response === 'undefined') {
        return {
            messages: [],
            maxCheckinId: lastSeenId
        };
    }
    
    const {
        checkins: {
            items
        }
    } = response;
    
    const users = process.env.USERS.split(',');
    const checkinMessages = [];
    console.log(`Processing ${items.length} checkins`);
    
    items.reverse()
    let maxCheckinId = lastSeenId;
    for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const {
            user: {
                user_name: userName
            },
            checkin_id
        } = item;
        
        if (checkin_id > maxCheckinId) {
            maxCheckinId = checkin_id;
        }
        
        if (users.indexOf(userName.toLowerCase()) == -1) {
            continue;
        } 
        
        checkinMessages.push(buildCheckinMessage(item));
    }
    
    return {
        messages: checkinMessages,
        maxCheckinId,
    };
}

const buildCheckinMessage = checkin => {
    const {
        media,
        user,
        brewery,
        beer,
        venue,
        rating_score,
        checkin_comment,
    } = checkin;

    var beerABV = "";
    if (typeof beer.beer_abv !== 'undefined') {
        beerABV = ` (${beer.beer_abv.toFixed(1)}%)`;
    }

    var venueFormat = "";
    if (typeof venue !== 'undefined' && typeof venue.venue_id !== 'undefined') {
        venueFormat = ` at *<${buildUntappdUri(`/v/${venue.venue_slug}/${venue.venue_id}`)}|${venue.venue_name}>*`;
    }

    var ratingFormat = "";
    if (typeof rating_score !== 'undefined') {
        ratingFormat = ` (${rating_score}/5)`;
    }

    var checkinComment = "";
    if (typeof checkin_comment !== 'undefined' && checkin_comment.length > 0) {
        checkinComment = ` "${checkin_comment}"`;
    }
    
    const text = ":beer: " + 
        `*<${buildUntappdUri(`/user/${user.user_name}`)}|${user.user_name}>* ` + 
        `is drinking *<${buildUntappdUri(`/b/${brewery.brewery_slug}/${beer.bid}`)}|${beer.beer_name}>*${beerABV} ` +
        `by *<${buildUntappdUri(`/w/${brewery.brewery_slug}/${brewery.brewery_id}`)}|${brewery.brewery_name}>*` + 
        `${venueFormat}` +
        `${ratingFormat}` +
        `${checkinComment}`;
        
        
    const image = {};
    if (typeof media.count !== 'undefined' && media.count > 0) {
        const img = media.items.pop();
        image['image_url'] = img.photo.photo_img_md;
        image['title'] = beer.beer_name;
    }
    
    return {
        icon_url: beer.beer_label,
        text,
        image
    }
};

const sendCheckinsToSlack = async checkins => {
    const SLACK_TOKEN = process.env.SLACK_TOKEN;
    
    for (let i = 0; i < checkins.length; i++) {
        const {
            icon_url,
            text,
            image
        } = checkins[i];
        
        const payload = {
            icon_url,
            username: 'Untappd',
            text: text
        };
        
        if (typeof image.image_url !== 'undefined') {
            payload['attachments'] = [{ ...image }];
        }
        
        try {
            const response = await axios.post(
               `https://hooks.slack.com/services/${SLACK_TOKEN}`,
               payload
            );
            
            if (response.data !== "ok") {
                console.log("Invalid response: " + response.data);
            }
        }  catch (e) {
            console.log("Error while attempting to post checkin to Slack: " + e);
        }
       
       break;
    }
}

const buildUntappdUri = path => (`https://untappd.com${path}`);
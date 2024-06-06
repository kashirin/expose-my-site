import express from 'express';
import { getSystems } from './helpers.js';
const app = express();
const port = process.env.port;
const lp = process.env.lp; //sec
const ttl = process.env.ttl; // sec

let SYS = getSystems(); // system -> angent_token

import bodyParser from 'body-parser';
require('body-parser-xml')(bodyParser);

function addSec(date, sec) {
    return new Date(date.getTime() + sec*1000);
}

function getCorId(){
    return 'ID'+Math.random();
}

function getExposedSystem(req){
  let system = req.headers['x-system'];
  if(req.query.__system){
    system = req.query.__system;
  }
  return system;
}


function canExposeThisSystem(req){
    
    let system = getExposedSystem(req);

    if(!SYS[system]){
        return {error: 'bad system name '+system};
    }

    return {result: true};
}



let commands = {};

for(let s in SYS){
    commands[s]=[];
}

let responseWaiting = {};

///////////////////////

let receiver = () => {};

let responseReady = (data) => {
    const now = new Date();
    // analize body and mime
    let cor_id = data.cor_id;
    let headers = data.headers;
    let code = data.code;
    
    console.log(`<--- ${now.toISOString()} response [${cor_id}] received`);
    if(!cor_id){
        console.log('data',JSON.stringify(data, null,4));
    }
    


    for(let k in headers){
        responseWaiting[cor_id].header(k,headers[k]);
    }
    responseWaiting[cor_id].status(code);
    if(data.sbuffer){//console.log(data.sbuffer);
        return responseWaiting[cor_id].end(Buffer.from(data.sbuffer));
    }else{
        return responseWaiting[cor_id].send(data.body);
    }
    
}


//app.use(bodyParser.raw({  }));
app.use(bodyParser.json({  type: 'application/json',  limit: '50mb', extended: true}));
app.use(bodyParser.urlencoded({  type: 'application/x-www-form-urlencoded', limit: '50mb', extended: false}));
app.use(bodyParser.text({type: 'text/xml'}));


app.use(function(req, res, next) {
    res.header("Access-Control-Allow-Origin", "*"); // update to match the domain you will make the request from
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    //res.header("Content-Type","application/json");
    next();
});


function haveCommand(system){

    if(commands[system].length<=0){
        return false;
    }

    const dn = new Date();
    commands[system] = commands[system].filter(e=>{
        if(e.alive_till<dn){
            return false;
        }else{
            return true;
        }
    })

    if(commands[system].length>0){
        let r = commands[system].shift();
        return r;
    }else{
        return false;
    }
}

// сюда агент выдает результаты исполненных команд
app.post('/__return_result', (req, res) => {
    responseReady(req.body);
    res.header("Content-Type","application/json");
    return res.send({result: true});
});

// сюда обращается агент за своими командами
app.get('/__listen_for_commands', (req, res) => {
    let token = req.query.token;
    let system = req.query.system;
    const now = new Date();
    //console.log(`request from agent [${system}] ${now}`);
    res.header("Content-Type","application/json");
    
    if(!SYS[system]){
        return res.send({error: 'agent sent bad system '+system});
    }

    if(SYS[system] && SYS[system]!=token){
        return res.send({error: 'agent sent bad token'});
    }

    let com = haveCommand(system);
    if(com){
        
        return res.send({result: com});
    }

    //console.log('waiting for commands...');

    let timerId = setTimeout(()=>{
        return res.send({result: false});
    },lp*1000);

    receiver = () => {
        clearTimeout(timerId);
        let com = haveCommand(system);
        receiver = () => {};
        if(com){
            return res.send({result: com});
        }else{
            return res.send({result: false});
        }
    }

})


app.get('*', (req, res) => {
    
    let auth = canExposeThisSystem(req);

    if(auth.error){
        return res.send({error: auth.error});
    }

    let system = getExposedSystem(req);

    let cor_id = getCorId();

    const now = new Date();

    let cmd = {
        query: req.query,
        headers: req.headers,
        url: req.url,
        method: 'GET',
        alive_till: addSec(new Date(), ttl),
        cor_id
    }

    commands[system].push(cmd);

    console.log(`---> ${now.toISOString()} GET request [${cor_id}] to ${req.url}`);

    receiver();
    
    responseWaiting[cor_id] = res;
})

app.post('*', (req, res) => {
    
    
    let auth = canExposeThisSystem(req);

    if(auth.error){
        return res.send({error: auth.error});
    }

    let system = getExposedSystem(req);

    let cor_id = getCorId();

    const now = new Date();
    //console.log('bod',req.body);
    let cmd = {
        query: req.query,
        body: req.body,
        headers: req.headers,
        url: req.url,
        method: 'POST',
        alive_till: addSec(new Date(), ttl),
        cor_id
    }

    commands[system].push(cmd);

    console.log(`---> ${now.toISOString()} POST request [${cor_id}] to ${req.url}`);

    receiver();
    
    responseWaiting[cor_id] = res;
})
  


app.listen(port, () => {
  console.log(`app listening at http://localhost:${port}`)
})
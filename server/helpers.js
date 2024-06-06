import { process_params } from "express/lib/router";

const add2 = (a, b) => {
    return a+b;
}

const getSystems = () => {
    let sys = {};
    for(const name in process.env){
        if(name.startsWith('system_')){
            const system = name.substring(7).toLowerCase();
            const agent_token = process.env[name];
            if(typeof agent_token === 'string'){
                sys[system] = agent_token;
            }
        }
    }
    return sys;
}

export {
    add2,
    getSystems
};
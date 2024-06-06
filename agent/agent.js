import http from 'http';
import request from 'request';

// Условное имя системы
const system = process.env.system;
// Токен авторизации системы
const token = process.env.token;
// Адрес сайта куда данный агент будет проксировать все запросы
const proxy_base_url = process.env.url_to_expose;
// Адрес сервера, который обрабатывает запросы (входящие команды, и ответ на них)
const comserver = process.env.server_url;
// Период ожидания ответа в лонгпулинге
const lp = process.env.lp; //sec

const isBinCont = (headers) => {
	const t = ''+headers['content-type'];
	const nonbin = ['text', 'html', 'json'];
	let isbin = true;
	for(let part of nonbin){
		if(t.includes(part)){
			isbin = false;
			break;
		}	
	}
	return isbin;
}


// application/json
const makepost = (url, headers, jsn) => {
    console.log('POST ',url, 'headers',headers);

    let opt = {
            url: url,
            //json: jsn,	
            method: 'POST',
            headers: headers
            
    }
	
    if(typeof jsn === "string"){
      opt.body = jsn;
    }else{
      opt.json = jsn;
    }

    return new Promise((resolve,rj)=>{
        request(opt, function(error, response, body){
            if(error) {
                return rj(error);
            } else {
                return resolve({body: response.body, headers: response.headers, code: response.statusCode});
            }
        });

    });
}

// application/x-www-form-urlencoded
const makeFormPost = (url, headers, jsn) => {
    console.log('POST ',url);
    return new Promise((resolve,rj)=>{
        request.post({
            url: url,
            form: jsn  
        }, function(error, response, body){
            if(error) {
                return rj(error);
            } else {
                return resolve({body: response.body, headers: response.headers, code: response.statusCode});
            }
        });

    });
}


const makehead = (url) => {
    return new Promise((resolve,rj)=>{
        request({
            url: url,	
            method: 'HEAD',   
        }, function(error, response, body){
            if(error) {
                return rj(error);
            } else {
                return resolve({headers: response.headers, code: response.statusCode});
            }
        });

    });
}

const makeget = (url, headers) => {
    console.log('GET ',url);
    return new Promise((resolve,rj)=>{
        request({
            url: url,	
            method: 'GET',
            headers: headers,
	    //encoding:null
            
        }, function(error, response, body){
		const buffer = Buffer.from(body).toJSON();
		console.log('buf',JSON.stringify(buffer));
            if(error) {
                return rj(error);
            } else {
                return resolve({body: response.body, headers: response.headers, code: response.statusCode});
            }
        });

    });
}

const makeget2 = (url, headers) => {
    return new Promise((resolve,rj)=>{
	console.log('GET ',url);
	makehead(url)
	.then(r=>{
		//console.log('head',r);
			let opts = {
			    url: url,	
			    method: 'GET',
			    headers: headers
			    
			};

			const isbin = isBinCont(r.headers);

			if(isbin){
				opts.encoding = null;
			}
		
			request(opts, function(error, response, body){
			    if(error) {
				return rj(error);
			    } else {
				if(isbin){
					const buffer = Buffer.from(body).toJSON();
					return resolve({body: '', sbuffer: buffer, headers: response.headers, code: response.statusCode});
				}else{
					return resolve({body: response.body, sbuffer: null, headers: response.headers, code: response.statusCode});
				}
			    }
			});
	})
	.catch(e=>{
		return rj(e);	
	})

    });
}


/////


let rq; // global


let proc = () => {

console.log('start proc...');    

const commpath = `/__listen_for_commands/?system=${system}&token=${token}&r=`+Math.random();
const reqpath = `/__return_result/?system=${system}&token=${token}&r=`+Math.random();



rq = http.get(comserver+commpath, res => {
  let data = [];
  console.log('Status Code:', res.statusCode);

  res.on('data', chunk => {
    data.push(chunk);
  });

  res.on('end', () => {
    //console.log('Response ended: ');
    let statuses = {};
    //console.log('received', JSON.stringify(statuses,null,4));
    try{
	
	statuses = JSON.parse(Buffer.concat(data).toString());
        if(statuses.result){

            let url = statuses.result.url;
            let method = statuses.result.method;
            let cor_id = statuses.result.cor_id;
            let ctype = statuses.result.headers['content-type'];
	    let copy_headers = JSON.parse(JSON.stringify(statuses.result.headers));
	    let body = statuses.result.body; // объект или строка в случае xml

            if(copy_headers['host']){
		let host = proxy_base_url.replace('http://','');
		let ahost = host.split(':');
		if(ahost.length>1){
			host = ahost[0];		
		}
		copy_headers['host'] = host;
		//console.log('hsot',host);
	    }
	    

            if(method == 'GET'){
		 
                //console.log('with headers', copy_headers);
                makeget2(proxy_base_url+url, copy_headers)
                .then(rsp=>{
                    //console.log('postProcessHeaders(rsp.headers)',typeof rsp.body);
                    return makepost(comserver+reqpath, {'content-type': 'application/json'}, {cor_id, body: rsp.body, sbuffer: rsp.sbuffer, headers: rsp.headers, code: rsp.code});
                })
                .then(r=>{
                    proc();
                })
                .catch(e=>{
                    console.log('Error in request for command: ', e.message);
                    proc();
                })

	    }else if(method == 'POST'){
                let mtd = makepost;

		if(ctype == 'application/x-www-form-urlencoded'){
			mtd = makeFormPost;
		}
		
		mtd(proxy_base_url+url, copy_headers, body)
                .then(rsp=>{
                    //console.log('rec to ',comserver+reqpath);
		    //console.log('rsp.headers',rsp);
                    return makepost(comserver+reqpath, {'content-type': 'application/json'}, {cor_id, body: rsp.body, headers: rsp.headers, code: rsp.code});
                })
                .then(r=>{
                    proc();
                })
                .catch(e=>{
                    console.log('Error in request for command: ', e.message);
                    proc();
                })

		
            }else{
                 console.log('not GET not POST');
                proc();
            }

	               

        }else{
		console.log('Error',statuses);
	}
	
    }catch(e){
        console.log('error',e);
	setTimeout(()=>{
           proc();
	},500)
    }
    
  });
}).on('error', err => {
  console.log('Error1: ', err.message);
  //proc();
  //process.exit(1);
});

rq.setTimeout( lp*1000, function( ) {
    // handle timeout here
    console.log('proc timed out');
    rq.destroy( );
    setTimeout(proc,100);
    
});


};

proc();

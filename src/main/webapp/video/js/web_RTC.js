/**
 * Created by zc on 2016/12/8.
 */

function createPeerConnection() {//创建重置rtc连接

    // stun和turn服务器
    var iceServer = {
        "iceServers": [
            {
                "url": "stun:stun.l.google.com:19302"
            },
            {
                "url": "turn:numb.viagenie.ca",
                "username": "zc1217zc@126.com",
                "credential": "fhqbukn"
            }
        ]
    };

    // 创建PeerConnection实例 (参数为null则没有iceserver，即使没有stunserver和turnserver，仍可在局域网下通讯)
    pc = new PeerConnection(iceServer);

    // 发送ICE候选到其他客户端
    pc.onicecandidate = function (event) {
        console.log("发送ICE候选");
        if (event.candidate !== null) {
            websocket_rtc.send(JSON.stringify({
                "style": "ice_candidate",
                "data": {
                    "candidate": event.candidate
                },
                "session_id": session_id
            }));
        }
    };

    // 远程视频添加
    pc.onaddstream = function onRemoteStreamAdded(event) {
        console.log("远程视频添加");
        remoteVideoUrl = getObjectURL(event.stream);
        remoteStream = event.stream;
        if (!isprovider) {
            $("#live_video")[0].src = remoteVideoUrl;
        }
        // waitForRemoteVideo();//等待视频接通
    };

    // 连接打开
    pc.onopen = function onSessionOpened(message) {
        console.log("连接打开");
    }

    // 开始连接
    pc.onconnecting = function onSessionConnecting(message) {
        console.log("开始连接");
    }

    // 远程视频移除
    pc.onremovestream = function onRemoteStreamRemoved(event) {
        console.log("远程视频移除");
    }

    //将rtc连接对象加入数组中
    pc_opened_array.push(pc);

}

// 发送offer和answer的函数，发送本地session描述
var sendOfferFn = function (desc) {
    console.log("发送offer信令");
    pc.setLocalDescription(desc);
    websocket_rtc.send(JSON.stringify({
        "style": "offer",
        "data": {
            "sdp": desc
        }
    }));
};
var sendAnswerFn = function (desc) {
    console.log("发送回复answer信令");
    pc.setLocalDescription(desc);
    websocket_rtc.send(JSON.stringify({
        "style": "answer",
        "data": {
            "sdp": desc
        },
        "session_id": session_id
    }));
};


// 等待远程视频
function waitForRemoteVideo() {
    if (pc.iceConnectionState == "connected") {// 判断rtc连接状态
        console.log("视频已经接通");
    } else {
        console.log("pc当前状态---" + pc.iceConnectionState);
        setTimeout(waitForRemoteVideo, 100);
    }

}


//处理到来的信令
function processSignalingMessage(message) {
    console.log('onmessage:', message);

    if (message.style === "offer") {

        //answer端收到offer信令后才会创建peerConnection
        createPeerConnection();
        pc.addStream(localStream);


        if (message.data.sdp != null) {
            pc.setRemoteDescription(new RTCSessionDescription(message.data.sdp));
        }
        session_id = message.session_id;
        pc.createAnswer(sendAnswerFn, function (error) {
            console.log('Failure callback: ' + error);
        });
    }
    else if (message.style === "answer") {
        if (message.data.sdp != null) {
            pc.setRemoteDescription(new RTCSessionDescription(message.data.sdp));
        }
    }
    else if (message.style === "ice_candidate" && islived) {
        //如果是一个ICE的候选，则将其加入到PeerConnection中，否则设定对方的session描述为传递过来的描述
        if (message.data.candidate != null) {
            pc.addIceCandidate(new RTCIceCandidate(message.data.candidate));
        }
    }
    else if (message.style === "bye" && islived) {
        // alert("1")
        // if (!ishost) {//不是主播还是不是isprovider？？？？？？
        //     remoteClose();
        // }
        // else {
        //     //........没想好
        // }
        remoteClose();
    }

};


//获取视频流低版本兼容
var promisifiedOldGUM = function (constraints) {

    // First get ahold of getUserMedia, if present
    var getUserMedia = (navigator.getUserMedia || navigator.webkitGetUserMedia || navigator.mozGetUserMedia || navigator.msGetUserMedia)


    if (!getUserMedia) {
        return Promise.reject(new Error('getUserMedia is not implemented in this browser'));
    }

    return new Promise(function (resolve, reject) {
        getUserMedia.call(navigator, constraints, resolve, reject);
    });
};


// 获取用户的媒体(获取本地音频和视频流)
function getUserMedia(code) {
    console.log("获取用户媒体");

    if (navigator.mediaDevices === undefined) {
        navigator.mediaDevices = {};
    }

    if (navigator.mediaDevices.getUserMedia === undefined) {
        navigator.mediaDevices.getUserMedia = promisifiedOldGUM;
        //alert("低版本兼容")
    }


    var constraints = {
        audio: {
            mandatory: {
                echoCancellation: true
            }
        },
        video: {
            mandatory: {
                // width: {exact: 1280},
                // height: {exact: 720},
                // aspectRatio: 1.777777778,
                // frameRate: {ideal: 15, max: 30}
                maxFrameRate: 60,
                minAspectRatio: 1.777777778,
                maxAspectRatio: 1.777777778
            }
        }

    };

    navigator.mediaDevices.getUserMedia(constraints)
        .then(function (stream) {
            //绑定本地媒体流到video标签用于输出
            var local_stream_clone = stream.clone();
            local_stream_clone.getAudioTracks()[0].enabled = false;
            local_stream_clone.getAudioTracks()[0].muted = true;
            console.log("静音成功");
            localVideoUrl = getObjectURL(local_stream_clone);


            if (isprovider) {

                localStream = stream;
                // remoteStream=local_stream_clone;

            }
            else {
                localStream = local_stream_clone;
            }

            requst_live_src(code);
        })
        .catch(function (err) {
            //处理媒体流创建失败错误
            console.log('getUserMedia error: ' + err);
            if (ishost) {
                alert("亲,媒体流获取失败！请检查是否在https环境下或尝试更换chrome浏览器");
                window.location.reload(true);//刷新页面
            } else {
                var stream_null = $("<canvas></canvas>")[0].captureStream(25);
                localStream = stream_null;
                console.log("视频流已经被null填充");
                requst_live_src(code);
            }
        });
}


//请求直播资源
function requst_live_src(code) {
    // if(code===1){//启动直播
    //     startlive();
    // }
    if (ishost) {//主播
        $("#live_video")[0].src = localVideoUrl;//显示主播视频
        if (!islived) {
            startlive();
        }
    }
    else {

        // $("#view_video")[0].src = localVideoUrl;//显示观众自己视频

        if (islived) {
            //创建rtc连接对象
            createPeerConnection();
            //向PeerConnection中加入需要发送的流
            pc.addStream(localStream);
            //创建并发送请求信令
            pc.createOffer(sendOfferFn, function (error) {
                console.log('Failure callback: ' + error);
            });
        }
        else {
            alert("直播未开始、、、")
        }
    }


}

//启动直播
function startlive() {

    if (ishost && !islived) {
        websocket_rtc.send(JSON.stringify({
            "style": "ishost_start",
            "data": {}
        }));

        $("#open_btn").css({"background-color": "#4285F4"});
        $("#open_btn").text("正在直播中");
        $("#open_btn").attr("disabled", "disabled");
        islived = true;//直播正在进行

    } else {
        alert("不能开启直播 ishost:" + ishost + "---islived" + islived);
    }

}

//主播退出
function remoteClose() {
    alert("主播关闭了直播哦！");
    islived = false;
    $("#live_video")[0].src = "";
    pc.close();
    pc_opened_array.splice($.inArray(pc, pc_opened_array), 1);
}
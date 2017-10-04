/**
 * Created by zc on 2016/12/8.
 */

function createPeerConnection() {//创建重置rtc连接

    // stun和turn服务器
    const configuration = {
        iceServers: [{
            urls: [
                "stun:stun.l.google.com:19302",
            ]
        }, {
            urls: "turn:numb.viagenie.ca",
            username: "zc1217zc@126.com",
            credential: "fhqbukn"
        }]
    };


    // 创建PeerConnection实例 (参数为null则没有iceserver，即使没有stunserver和turnserver，仍可在局域网下通讯)
    pc = new RTCPeerConnection(configuration);

    // 发送ICE候选到其他客户端
    pc.onicecandidate = function (event) {
        console.log("发送ICE候选");
        if (event.candidate !== null) {
            websocket.send(JSON.stringify({
                "group": "rtc",
                "type": "ice_candidate",
                "data": {
                    "candidate": event.candidate
                },
                "session_id": session_id
            }));
        }
    };

    // 远程视频添加
    pc.ontrack = function onRemoteStreamAdded(event) {
        console.log("远程视频添加");
        remoteStream = event.streams[0];
        if (!isprovider) {
            $("#live_video")[0].srcObject = remoteStream;
        }
    };

    pc.oniceconnectionstatechange = function (event) {
        if (pc.iceConnectionState === "failed" ||
            pc.iceConnectionState === "disconnected" ||
            pc.iceConnectionState === "closed") {
            console.error(event)
            // alert("连接中断请刷新")
        }
    };
    //将rtc连接对象加入数组中
    pc_opened_array.push(pc);

}

// 发送offer和answer的函数，发送本地session描述
var sendOfferFn = function (offer) {
    console.log("发送offer信令");
    pc.setLocalDescription(new RTCSessionDescription(offer), () => {
        websocket.send(JSON.stringify({
            "group": "rtc",
            "type": "offer",
            "data": {
                "sdp": offer
            }
        }));
    }, error => {
        console.error("sendOffer" + error)
    });
};
var sendAnswerFn = function (answer) {
    console.log("发送回复answer信令");
    pc.setLocalDescription(new RTCSessionDescription(answer), () => {
        websocket.send(JSON.stringify({
            "group": "rtc",
            "type": "answer",
            "data": {
                "sdp": answer
            },
            "session_id": session_id
        }));
    }, error => {
        console.error("sendAnswer" + error)
    });

};

//处理到来的信令
function processSignalingMessage(message) {
    console.log('onmessage:', message);

    if (message.type === "offer") {

        //answer端收到offer信令后才会创建peerConnection
        createPeerConnection();
        localStream.getTracks().forEach(function (track) {
            pc.addTrack(track, localStream);
        });


        if (message.data.sdp != null) {
            pc.setRemoteDescription(new RTCSessionDescription(message.data.sdp));
        }
        session_id = message.session_id;
        // var offerOptions = {
        //     optional: [],
        //     mandatory: {
        //         OfferToReceiveAudio: false,
        //         OfferToReceiveVideo: false
        //     }
        // };
        pc.createAnswer(sendAnswerFn, function (error) {
            console.log('Failure callback: ' + error);
        });
    }
    else if (message.type === "answer") {
        if (message.data.sdp != null) {
            pc.setRemoteDescription(new RTCSessionDescription(message.data.sdp));
        }
    }
    else if (message.type === "ice_candidate" && islived) {
        //如果是一个ICE的候选，则将其加入到PeerConnection中，否则设定对方的session描述为传递过来的描述
        if (message.data.candidate != null) {
            pc.addIceCandidate(new RTCIceCandidate(message.data.candidate));
        }
    }
    else if (message.type === "bye" && islived) {
        // alert("1")
        // if (!isliver) {//不是主播还是不是isprovider？？？？？？
        //     remoteClose();
        // }
        // else {
        //     //........没想好
        // }
        remoteClose();
    }

};

// 获取用户的媒体(获取本地音频和视频流)
function getUserMedia() {
    console.log("获取用户媒体");

    var constraints = {
        audio: {
                echoCancellation: true
        },
        video: {
                width: 1280,
                height: 720,
                frameRate: 60
        }
    };

    navigator.mediaDevices.getUserMedia(constraints).then(function (stream) {
        //绑定本地媒体流到video标签用于输出
        localStream = stream;
        var local_stream_clone = stream.clone();
        local_stream_clone.getAudioTracks()[0].enabled = false;
        // local_stream_clone.getAudioTracks()[0].muted = true;
        console.log("静音成功");
        $("#live_video")[0].srcObject = local_stream_clone;//显示主播视频
        startlive();//发送启动直播信息
    }).catch(function (err) {
        //处理媒体流创建失败错误
        console.error('getUserMedia error: ' + err);
        if (isprovider) {
            alert("亲,媒体流获取失败！请检查是否在https环境下或尝试更换chrome浏览器");
            window.location.reload(true);//刷新页面
        }
    });
}

//请求直播资源
function requst_live_src() {
    if (!islived) {
        // alert("直播未开始、、、")
    } else {
        //创建rtc连接对象
        createPeerConnection();
        //向PeerConnection中加入需要发送的流
        var stream_null = $("<canvas></canvas>")[0].captureStream(60);
        localStream = stream_null;
        console.log("视频流已经被null填充");


        var ac = new (window.AudioContext || window.webkitAudioContext)(); // declare new audio context
        var audioStream = ac.createMediaStreamDestination().stream;
        localStream.addTrack(audioStream.getAudioTracks()[0]);
        localStream.getTracks().forEach(function (track) {
            pc.addTrack(track, localStream);
        });

        var offerOptions = {
                OfferToReceiveAudio: 1,
                OfferToReceiveVideo: 1
        };
        //创建并发送请求信令
        pc.createOffer(sendOfferFn, (error) => {
                console.log('Failure callback: ' + error);
            },offerOptions
        );
    }
}

//启动直播
function startlive() {

    if (isliver && !islived) {
        websocket.send(JSON.stringify({
            "group": "rtc",
            "type": "start_live",
            "data": {}
        }));

        $("#open_btn").css({"background-color": "#4285F4"});
        $("#open_btn").text("正在直播中");
        $("#open_btn").attr("disabled", "disabled");
        islived = true;//直播正在进行

    } else {
        alert("不能开启直播 isliver:" + isliver + "---islived" + islived);
    }

}

//主播退出
function remoteClose() {
    alert("主播关闭了直播哦！");
    islived = false;
    $("#live_video")[0].src = "";
    pc.close();
    pc_opened_array.splice($.inArray(pc, pc_opened_array), 1);
    pc = null;
}
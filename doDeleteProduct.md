点击“删除已上架产品”按钮
调用已上架产品/api/publish/get_product_upshelf_list，get请求，参数userId、userCode、currentDays(最近多少天)
api返回
{
    "message": null,
    "statusCode": 200,
    "dataClass": {
        "applyCodes": [
            "test_2506230022",
            "test_2506240019",
            "test_2506240021",
            "test_2506240022",
            "test_2506240029",
            "test_2506240031",
            "test_2506250003",
            "test_2506250006",
            "test_2506250032",
            "test_2506250043",
            "test_2506260006",
            "test_2506260027",
            "test_2506260031",
            "test_2506260046",
            "test_2508040011",
            "test_2508200010"
        ]
    }
}

如果index.json索引文件中的产品的applyCode在已上架产品中，删除index.json索引文件中对应数据，删除对应文件夹。注意不要改变其他逻辑，不要影响现有逻辑
[
  {
    "applyCode": "test_2510290006",
    "chineseName": "海量食品级马口铁茶叶密封罐 圆形储存罐 金属收纳罐 50克容量 抹茶粉茶叶储存罐",
    "chinesePackageList": "1* 马口铁密封储存罐",
    "status": 3,
    "originalImages": [
      {
        "imageUrl": "https://openapi.sjlpj.cn:5002/publishoriginapath/test_2510290006/old_1.jpg",
        "status": "not_downloaded",
        "timestamp": 1766734703645
      },
      {
        "imageUrl": "https://openapi.sjlpj.cn:5002/publishoriginapath/test_2510290006/old_2.jpg",
        "status": "not_downloaded",
        "timestamp": 1766734703645
      }
    ],
    "publishSkus": [
      {
        "attrClasses": [
          {
            "attrName": "颜色款式",
            "attrValue": "银色"
          }
        ],
        "skuImages": [
          {
            "imageUrl": "https://openapi.sjlpj.cn:5002/publishoriginapath/test_2510290006/2d6948ec-2614-4064-b05b-cbd758c783fc.png",
            "index": 0,
            "status": "not_downloaded",
            "timestamp": 1766734703645
          }
        ],
        "skuIndex": 0
      },
      {
        "attrClasses": [
          {
            "attrName": "颜色款式",
            "attrValue": "白色"
          }
        ],
        "skuImages": [
          {
            "imageUrl": "https://openapi.sjlpj.cn:5002/publishoriginapath/test_2510290006/97b9ec87-8cad-4176-a8c4-620c7747af3b.png",
            "index": 0,
            "status": "not_downloaded",
            "timestamp": 1766734703646
          }
        ],
        "skuIndex": 1
      },
      {
        "attrClasses": [
          {
            "attrName": "颜色款式",
            "attrValue": "金色"
          }
        ],
        "skuImages": [
          {
            "imageUrl": "https://openapi.sjlpj.cn:5002/publishoriginapath/test_2510290006/4d101fc2-2740-44f8-a359-b1b6b5a6baf1.png",
            "index": 0,
            "status": "not_downloaded",
            "timestamp": 1766734703646
          }
        ],
        "skuIndex": 2
      }
    ],
    "senceImages": [
      {
        "imageUrl": "https://openapi.sjlpj.cn:5002/publishoriginapath/test_2510290006/9a320a5d-c3a8-4438-a3f0-0520727a18a9.png",
        "index": 0,
        "status": "not_downloaded",
        "timestamp": 1766734703646
      },
      {
        "imageUrl": "https://openapi.sjlpj.cn:5002/publishoriginapath/test_2510290006/dc790b4e-6804-425d-b114-066c1872c4f4.png",
        "index": 1,
        "status": "not_downloaded",
        "timestamp": 1766734703646
      }
    ],
    "userId": 0,
    "userCode": null
  }
]
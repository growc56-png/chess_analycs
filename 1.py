from ipaddress import ip_network
net = ip_network('172.16.96.0/255.255.224.0', 0)
k = 0
for ip in net:
    b = f'{int(ip):032b}'
    if b.count('1') % 3 == 0:
        k += 1
print(k)
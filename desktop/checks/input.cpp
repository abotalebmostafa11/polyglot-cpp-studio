#include <iostream>
#include <string>
int main() {
std::string text = "code";
const char* view = text.c_str();
std::cout << view << "\n";
}
